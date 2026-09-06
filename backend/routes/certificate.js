const express = require('express');
const db = require('../db/db');
const { streamCertificate } = require('../services/certificatePdf');

const router = express.Router();       // mounted at /api/batches -> GET /:id/certificate
const publicRouter = express.Router(); // mounted at /api        -> GET /verify/:qrToken/certificate

router.get('/:id/certificate', async (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  await streamCertificate(res, batch);
});

// Public version - consumers reach this via the batch's human-readable code (QR token)
publicRouter.get('/verify/:qrToken/certificate', async (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE batch_code = ?').get(req.params.qrToken);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  await streamCertificate(res, batch);
});

module.exports = { router, publicRouter };
