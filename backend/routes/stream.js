const express = require('express');
const { liveSimulator } = require('../services/simulator');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/stream - Server-Sent Events (SSE) real-time telemetry & alerts stream
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('state', liveSimulator.getState());

  const onTick = (payload) => send('tick', payload);
  const onState = (state) => send('state', state);

  liveSimulator.on('tick', onTick);
  liveSimulator.on('state', onState);

  req.on('close', () => {
    liveSimulator.off('tick', onTick);
    liveSimulator.off('state', onState);
  });
});

// POST /api/stream/control - Control the real-time simulator (start, pause, step, speed)
router.post('/control', (req, res) => {
  const { action, interval_ms, hive_id } = req.body || {};

  if (action === 'start') {
    liveSimulator.start(interval_ms || liveSimulator.intervalMs);
  } else if (action === 'pause') {
    liveSimulator.pause();
  } else if (action === 'speed') {
    liveSimulator.setSpeed(interval_ms);
  } else if (action === 'step') {
    const tickResult = liveSimulator.stepOnce(hive_id || null);
    return res.json({ ok: true, state: liveSimulator.getState(), tick: tickResult });
  } else {
    return res.status(400).json({ error: 'Unknown control action. Use start, pause, speed, or step.' });
  }

  res.json({ ok: true, state: liveSimulator.getState() });
});

module.exports = router;
