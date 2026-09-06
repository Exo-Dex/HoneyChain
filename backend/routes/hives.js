const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/db');
const { generateReadings } = require('../services/simulator');
const { enrichHive, enrichHiveSummary } = require('../services/hiveEnrichment');

const router = express.Router();

// GET /api/hives?beekeeper_id=... - list hives (with latest health snapshot)
router.get('/', (req, res) => {
  const { beekeeper_id } = req.query;
  const hives = beekeeper_id
    ? db.prepare('SELECT * FROM hives WHERE beekeeper_id = ?').all(beekeeper_id)
    : db.prepare('SELECT * FROM hives').all();

  res.json(hives.map(enrichHiveSummary));
});

// POST /api/hives - register a new hive
// body: { beekeeper_id, apiary_id, species, simulate_profile }
router.post('/', (req, res) => {
  const { beekeeper_id, apiary_id, species, simulate_profile } = req.body;
  if (!beekeeper_id || !apiary_id) {
    return res.status(400).json({ error: 'beekeeper_id and apiary_id are required' });
  }

  const id = 'H-' + uuidv4().slice(0, 6).toUpperCase();
  const installed_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO hives (id, apiary_id, beekeeper_id, species, status, installed_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?)
  `).run(id, apiary_id, beekeeper_id, species || 'Apis cerana', installed_at);

  // Seed simulated sensor history so the hive isn't empty on first view
  const readings = generateReadings(id, 24, simulate_profile || 'healthy');
  const insert = db.prepare(`
    INSERT INTO sensor_readings (id, hive_id, timestamp, temperature, humidity, weight)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) insert.run(r.id, r.hive_id, r.timestamp, r.temperature, r.humidity, r.weight);
  });
  insertMany(readings);

  res.status(201).json({ id, apiary_id, beekeeper_id, species, status: 'ACTIVE', installed_at });
});

// GET /api/hives/:id - full hive detail with readings + AI insight
router.get('/:id', (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: 'Hive not found' });

  res.json(enrichHive(hive));
});

// POST /api/hives/:id/simulate - regenerate a fresh reading batch (e.g. to demo a profile change live)
router.post('/:id/simulate', (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: 'Hive not found' });

  const profile = req.body.profile || 'healthy';
  db.prepare('DELETE FROM sensor_readings WHERE hive_id = ?').run(hive.id);

  const readings = generateReadings(hive.id, 24, profile);
  const insert = db.prepare(`
    INSERT INTO sensor_readings (id, hive_id, timestamp, temperature, humidity, weight)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) insert.run(r.id, r.hive_id, r.timestamp, r.temperature, r.humidity, r.weight);
  });
  insertMany(readings);

  res.json({ ok: true, profile, count: readings.length });
});

module.exports = router;
