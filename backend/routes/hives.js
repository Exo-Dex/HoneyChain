const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/db');
const { generateReadings, liveSimulator } = require('../services/simulator');
const { enrichHive, enrichHiveSummary } = require('../services/hiveEnrichment');
const { evaluateHiveReadings } = require('../services/alertEngine');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function assertOwnsHive(req, hive) {
  return req.user.role === 'admin' || hive.beekeeper_id === req.user.beekeeper_id;
}

router.get('/', (req, res) => {
  if (req.user.role === 'lab') {
    return res.status(403).json({ error: 'Lab accounts work with batches, not hives directly.' });
  }

  const hives = req.user.role === 'beekeeper'
    ? db.prepare('SELECT * FROM hives WHERE beekeeper_id = ?').all(req.user.beekeeper_id)
    : db.prepare('SELECT * FROM hives').all();

  res.json(hives.map(enrichHiveSummary));
});

router.post('/', requireRole('beekeeper'), (req, res) => {
  const { species, simulate_profile, telemetry_source, device_id } = req.body;
  const profile = simulate_profile || 'healthy';
  const source = telemetry_source === 'ESP32' ? 'ESP32' : 'SIMULATION';

  const apiary = db.prepare('SELECT id FROM apiaries WHERE beekeeper_id = ?').get(req.user.beekeeper_id);
  if (!apiary) {
    return res.status(500).json({ error: 'No apiary found for this account - this should not happen for a registered beekeeper.' });
  }

  const id = 'H-' + uuidv4().slice(0, 6).toUpperCase();
  const installed_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO hives (id, apiary_id, beekeeper_id, species, status, sim_profile, telemetry_source, device_id, installed_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
  `).run(id, apiary.id, req.user.beekeeper_id, species || 'Apis cerana', profile, source, device_id || null, installed_at);

  const readings = generateReadings(id, 24, profile);
  const insert = db.prepare(`
    INSERT INTO sensor_readings (
      id, hive_id, timestamp, temperature, humidity, weight,
      acoustic_hz, foraging_rate, battery_pct, rssi_dbm, source, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insert.run(
        r.id, r.hive_id, r.timestamp, r.temperature, r.humidity, r.weight,
        r.acoustic_hz ?? 215, r.foraging_rate ?? 48, r.battery_pct ?? 96, r.rssi_dbm ?? -68,
        source, device_id || null
      );
    }
  });
  insertMany(readings);

  const enriched = enrichHive({ id, apiary_id: apiary.id, beekeeper_id: req.user.beekeeper_id, species: species || 'Apis cerana', status: 'ACTIVE', sim_profile: profile, telemetry_source: source, device_id: device_id || null, installed_at });
  evaluateHiveReadings(enriched, enriched.readings, enriched.health);

  res.status(201).json({ id, apiary_id: apiary.id, beekeeper_id: req.user.beekeeper_id, species: species || 'Apis cerana', status: 'ACTIVE', sim_profile: profile, telemetry_source: source, device_id: device_id || null, installed_at });
});

router.get('/:id', (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: 'Hive not found' });

  if (req.user.role === 'lab' || !assertOwnsHive(req, hive)) {
    return res.status(403).json({ error: 'You do not have access to this hive.' });
  }

  res.json(enrichHive(hive));
});

// POST /api/hives/:id/readings - Ingest actual ESP32 sensor reading for a specific hive
router.post('/:id/readings', requireRole('beekeeper', 'admin'), (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: 'Hive not found' });
  if (!assertOwnsHive(req, hive)) {
    return res.status(403).json({ error: 'You do not have access to this hive.' });
  }

  try {
    const result = liveSimulator.ingestHardwareReading({
      ...req.body,
      hive_id: hive.id,
    }, req.ip);
    res.status(201).json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/hives/:id/simulate - regenerate a fresh simulated reading batch
router.post('/:id/simulate', requireRole('beekeeper', 'admin'), (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: 'Hive not found' });
  if (!assertOwnsHive(req, hive)) {
    return res.status(403).json({ error: 'You do not have access to this hive.' });
  }

  const profile = req.body.profile || 'healthy';
  db.prepare("UPDATE hives SET sim_profile = ?, telemetry_source = 'SIMULATION' WHERE id = ?").run(profile, hive.id);
  db.prepare('DELETE FROM sensor_readings WHERE hive_id = ?').run(hive.id);

  const readings = generateReadings(hive.id, 24, profile);
  const insert = db.prepare(`
    INSERT INTO sensor_readings (
      id, hive_id, timestamp, temperature, humidity, weight,
      acoustic_hz, foraging_rate, battery_pct, rssi_dbm, source, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATION', NULL)
  `);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insert.run(
        r.id, r.hive_id, r.timestamp, r.temperature, r.humidity, r.weight,
        r.acoustic_hz ?? 215, r.foraging_rate ?? 48, r.battery_pct ?? 96, r.rssi_dbm ?? -68
      );
    }
  });
  insertMany(readings);

  const updatedHive = db.prepare('SELECT * FROM hives WHERE id = ?').get(hive.id);
  const enriched = enrichHive(updatedHive);
  const generatedAlerts = evaluateHiveReadings(updatedHive, enriched.readings, enriched.health);

  liveSimulator.emit('tick', {
    tick: liveSimulator.tickCount,
    source: 'SIMULATION',
    timestamp: new Date().toISOString(),
    updates: [{
      hive_id: hive.id,
      telemetry_source: 'SIMULATION',
      sim_profile: profile,
      latest: enriched.readings[enriched.readings.length - 1],
      health: enriched.health,
      yield_prediction: enriched.yield_prediction,
    }],
    new_alerts: generatedAlerts,
  });

  res.json({ ok: true, profile, count: readings.length, health: enriched.health });
});

module.exports = router;
