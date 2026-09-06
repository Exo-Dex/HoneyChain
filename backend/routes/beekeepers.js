const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/db');

const router = express.Router();

// GET /api/beekeepers
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM beekeepers').all());
});

// POST /api/beekeepers
router.post('/', (req, res) => {
  const { name, district, state, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'BK-' + uuidv4().slice(0, 6).toUpperCase();
  db.prepare(`
    INSERT INTO beekeepers (id, name, district, state, phone, verified)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, name, district || null, state || null, phone || null);

  res.status(201).json({ id, name, district, state, phone, verified: 1 });
});

// GET /api/beekeepers/:id/apiaries
router.get('/:id/apiaries', (req, res) => {
  res.json(db.prepare('SELECT * FROM apiaries WHERE beekeeper_id = ?').all(req.params.id));
});

// POST /api/beekeepers/:id/apiaries
router.post('/:id/apiaries', (req, res) => {
  const beekeeper = db.prepare('SELECT * FROM beekeepers WHERE id = ?').get(req.params.id);
  if (!beekeeper) return res.status(404).json({ error: 'Beekeeper not found' });

  const { name, location, lat, lng } = req.body;
  const id = 'AP-' + uuidv4().slice(0, 6).toUpperCase();

  db.prepare(`
    INSERT INTO apiaries (id, beekeeper_id, name, location, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, beekeeper.id, name || 'My Apiary', location || null, lat || null, lng || null);

  res.status(201).json({ id, beekeeper_id: beekeeper.id, name, location, lat, lng });
});

module.exports = router;
