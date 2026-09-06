const express = require('express');
const db = require('../db/db');
const { appendEvent, getEventsForBatch, verifyChain } = require('../services/ledger');
const { assertAdvance, StateTransitionError } = require('../services/batchStateMachine');

const router = express.Router();

const ALLOWED_MANUAL_EVENTS = ['BATCH_RECEIVED', 'BATCH_PROCESSED'];

function hydrateBatch(batch) {
  const harvest = db.prepare('SELECT * FROM harvests WHERE id = ?').get(batch.harvest_id);
  const events = getEventsForBatch(batch.id);
  const qualityTests = db.prepare('SELECT * FROM quality_tests WHERE batch_id = ? ORDER BY tested_at ASC').all(batch.id);
  const product = db.prepare('SELECT * FROM products WHERE batch_id = ?').get(batch.id);

  return {
    ...batch,
    harvest: harvest ? { ...harvest, hive_ids: JSON.parse(harvest.hive_ids) } : null,
    events,
    quality_tests: qualityTests,
    product: product || null,
  };
}

// GET /api/batches
router.get('/', (req, res) => {
  const batches = db.prepare('SELECT * FROM batches ORDER BY created_at DESC').all();
  res.json(batches);
});

// GET /api/batches/:id - full detail including ledger events
router.get('/:id', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  res.json(hydrateBatch(batch));
});

// GET /api/batches/code/:code - lookup by human-readable batch code (used by QR/consumer flow)
router.get('/code/:code', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE batch_code = ?').get(req.params.code);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  res.json(hydrateBatch(batch));
});

// POST /api/batches/:id/advance
// body: { event_type: 'BATCH_RECEIVED' | 'BATCH_PROCESSED', actor, note }
// Demo "hero workflow" buttons - each writes a real ledger event. Server-side
// state checks live in services/batchStateMachine.js so this can't be bypassed
// by calling the API directly out of order (previously only the frontend
// hid the buttons - it didn't actually stop anything).
router.post('/:id/advance', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const { event_type, actor, note } = req.body;
  if (!ALLOWED_MANUAL_EVENTS.includes(event_type)) {
    return res.status(400).json({ error: `event_type must be one of: ${ALLOWED_MANUAL_EVENTS.join(', ')}` });
  }

  let newStatus;
  try {
    newStatus = assertAdvance(batch, event_type);
  } catch (err) {
    if (err instanceof StateTransitionError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }

  const event = appendEvent({
    batch_id: batch.id,
    event_type,
    actor: actor || 'demo-processing-unit',
    payload: { note: note || null },
  });

  db.prepare('UPDATE batches SET status = ? WHERE id = ?').run(newStatus, batch.id);

  res.json({ ok: true, batch_id: batch.id, new_status: newStatus, event });
});

// GET /api/batches/:id/verify - recompute the ENTIRE chain and report integrity
// (Global chain verification; the consumer UI calls this to show tamper-evidence.)
router.get('/:id/verify', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const result = verifyChain();
  res.json(result);
});

module.exports = router;
