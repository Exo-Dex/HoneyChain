const express = require('express');
const db = require('../db/db');
const { enrichHive } = require('../services/hiveEnrichment');
const { verifyChain } = require('../services/ledger');
const { liveSimulator } = require('../services/simulator');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const isBeekeeper = req.user.role === 'beekeeper';

  const hives = isBeekeeper
    ? db.prepare(`
        SELECT h.*, b.name as beekeeper_name, b.district, b.state, a.name as apiary_name
        FROM hives h
        LEFT JOIN beekeepers b ON h.beekeeper_id = b.id
        LEFT JOIN apiaries a ON h.apiary_id = a.id
        WHERE h.beekeeper_id = ?
      `).all(req.user.beekeeper_id)
    : db.prepare(`
        SELECT h.*, b.name as beekeeper_name, b.district, b.state, a.name as apiary_name
        FROM hives h
        LEFT JOIN beekeepers b ON h.beekeeper_id = b.id
        LEFT JOIN apiaries a ON h.apiary_id = a.id
      `).all();

  const enrichedHives = hives.map(enrichHive);

  const healthCounts = { Healthy: 0, Attention: 0, Critical: 0 };
  let totalScore = 0;
  let totalPredictedYield = 0;
  let avgTemp = 0;
  let avgHumidity = 0;

  enrichedHives.forEach(h => {
    healthCounts[h.health.status] = (healthCounts[h.health.status] || 0) + 1;
    totalScore += h.health.score || 0;
    totalPredictedYield += h.yield_prediction?.predicted_kg || 0;
    if (h.latest_reading) {
      avgTemp += h.latest_reading.temperature;
      avgHumidity += h.latest_reading.humidity;
    }
  });

  const hiveCount = enrichedHives.length || 1;

  const batches = db.prepare(`
    SELECT b.*, h.quantity_kg, h.floral_source, h.date as harvest_date
    FROM batches b
    LEFT JOIN harvests h ON b.harvest_id = h.id
    ORDER BY b.created_at DESC
  `).all();

  const batchStatusCounts = batches.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, { CREATED: 0, RECEIVED: 0, TESTED: 0, PROCESSED: 0, PACKAGED: 0, QUARANTINED: 0 });

  const floralBreakdown = {};
  batches.forEach(b => {
    const src = b.floral_source || 'Multi-floral';
    floralBreakdown[src] = Math.round(((floralBreakdown[src] || 0) + (b.quantity_kg || 0)) * 10) / 10;
  });

  const qualityTests = db.prepare('SELECT * FROM quality_tests ORDER BY tested_at DESC LIMIT 30').all();
  const activeAlerts = db.prepare("SELECT * FROM alerts WHERE status != 'RESOLVED' ORDER BY created_at DESC LIMIT 20").all();
  const integrity = verifyChain();

  res.json({
    simulation: liveSimulator.getState(),
    kpis: {
      total_hives: enrichedHives.length,
      avg_health_score: Math.round(totalScore / hiveCount),
      total_predicted_yield_kg: Math.round(totalPredictedYield * 10) / 10,
      avg_temperature_c: Math.round((avgTemp / hiveCount) * 10) / 10,
      avg_humidity_pct: Math.round((avgHumidity / hiveCount) * 10) / 10,
      active_alerts_count: activeAlerts.length,
      total_batches: batches.length,
      ledger_events_count: integrity.total_events,
      ledger_valid: integrity.valid,
    },
    health_distribution: healthCounts,
    batch_pipeline: batchStatusCounts,
    floral_breakdown_kg: floralBreakdown,
    quality_tests: qualityTests,
    active_alerts: activeAlerts,
    hives_matrix: enrichedHives.map(h => ({
      id: h.id,
      species: h.species,
      beekeeper_name: h.beekeeper_name,
      district: h.district,
      apiary_name: h.apiary_name,
      sim_profile: h.sim_profile || 'healthy',
      health: h.health,
      yield_prediction: h.yield_prediction,
      latest_reading: h.latest_reading,
      recent_readings: h.readings.slice(-16),
    })),
  });
});

module.exports = router;
