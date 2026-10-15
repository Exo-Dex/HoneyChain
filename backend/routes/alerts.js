const express = require('express');
const db = require('../db/db');
const { enrichHive } = require('../services/hiveEnrichment');
const { getThresholds, updateThresholds, evaluateHiveReadings } = require('../services/alertEngine');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/alerts - cluster-wide view for admin, or beekeeper-scoped alerts for beekeepers
router.get('/', (req, res) => {
  if (req.user.role === 'lab') {
    return res.status(403).json({ error: 'Alerts are available to Cluster Admins and Beekeepers.' });
  }

  const hives = req.user.role === 'admin'
    ? db.prepare(`
        SELECT h.*, b.name as beekeeper_name, b.district, b.state, a.name as apiary_name
        FROM hives h
        LEFT JOIN beekeepers b ON h.beekeeper_id = b.id
        LEFT JOIN apiaries a ON h.apiary_id = a.id
      `).all()
    : db.prepare(`
        SELECT h.*, b.name as beekeeper_name, b.district, b.state, a.name as apiary_name
        FROM hives h
        LEFT JOIN beekeepers b ON h.beekeeper_id = b.id
        LEFT JOIN apiaries a ON h.apiary_id = a.id
        WHERE h.beekeeper_id = ?
      `).all(req.user.beekeeper_id);

  const enriched = hives.map(hive => {
    const full = enrichHive(hive);
    evaluateHiveReadings(hive, full.readings, full.health);
    const { readings, ...rest } = full;
    return rest;
  });

  const counts = enriched.reduce((acc, h) => {
    acc[h.health.status] = (acc[h.health.status] || 0) + 1;
    return acc;
  }, { Healthy: 0, Attention: 0, Critical: 0, Unknown: 0 });

  const flagged = enriched
    .filter(h => h.health.status === 'Attention' || h.health.status === 'Critical')
    .sort((a, b) => (a.health.score ?? 0) - (b.health.score ?? 0));

  const incidents = req.user.role === 'admin'
    ? db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100').all()
    : db.prepare(`
        SELECT al.* FROM alerts al
        JOIN hives h ON al.hive_id = h.id
        WHERE h.beekeeper_id = ?
        ORDER BY al.created_at DESC LIMIT 100
      `).all(req.user.beekeeper_id);

  res.json({
    total_hives: enriched.length,
    counts,
    flagged,
    incidents,
    thresholds: getThresholds(),
  });
});

// POST /api/alerts/:id/acknowledge
router.post('/:id/acknowledge', requireRole('admin', 'beekeeper'), (req, res) => {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE alerts SET status = 'ACKNOWLEDGED', acknowledged_by = ?, updated_at = ?
    WHERE id = ?
  `).run(req.user.email, now, alert.id);

  res.json({ ok: true, id: alert.id, status: 'ACKNOWLEDGED', acknowledged_by: req.user.email });
});

// POST /api/alerts/:id/resolve
router.post('/:id/resolve', requireRole('admin', 'beekeeper'), (req, res) => {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const now = new Date().toISOString();
  const note = req.body.note || 'Resolved following inspection.';
  db.prepare(`
    UPDATE alerts SET status = 'RESOLVED', resolved_note = ?, acknowledged_by = COALESCE(acknowledged_by, ?), updated_at = ?
    WHERE id = ?
  `).run(note, req.user.email, now, alert.id);

  res.json({ ok: true, id: alert.id, status: 'RESOLVED', resolved_note: note });
});

// PUT /api/alerts/thresholds
router.put('/thresholds', requireRole('admin'), (req, res) => {
  const updated = updateThresholds(req.body || {});
  res.json({ ok: true, thresholds: updated });
});

module.exports = router;
