require('dotenv').config();
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { generateReadings } = require('../services/simulator');
const { enrichHive } = require('../services/hiveEnrichment');
const { evaluateHiveReadings } = require('../services/alertEngine');
const { hashPassword } = require('../services/auth');

const DEMO_PASSWORD = {
  beekeeper: 'beekeeper123',
  lab: 'lab123456',
  admin: 'admin12345',
};

function ensureBeekeeper({ id, name, district, state, phone, verified }) {
  const exists = db.prepare('SELECT id FROM beekeepers WHERE id = ?').get(id);
  if (exists) return false;
  db.prepare(`
    INSERT INTO beekeepers (id, name, district, state, phone, verified)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, district, state, phone, verified);
  return true;
}

function ensureApiary({ id, beekeeperId, name, location, lat, lng }) {
  const exists = db.prepare('SELECT id FROM apiaries WHERE id = ?').get(id);
  if (exists) return false;
  db.prepare(`
    INSERT INTO apiaries (id, beekeeper_id, name, location, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, beekeeperId, name, location || null, lat || null, lng || null);
  return true;
}

function ensureUser({ id, email, password, role, beekeeperId }) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return false;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, beekeeper_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email, hashPassword(password), role, beekeeperId || null, new Date().toISOString());
  return true;
}

function ensureHiveWithReadings(hiveId, apiaryId, beekeeperId, profile, species = 'Apis cerana') {
  const exists = db.prepare('SELECT id FROM hives WHERE id = ?').get(hiveId);
  if (exists) return false;

  db.prepare(`
    INSERT INTO hives (id, apiary_id, beekeeper_id, species, status, sim_profile, installed_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(hiveId, apiaryId, beekeeperId, species, profile, new Date().toISOString());

  const insertReading = db.prepare(`
    INSERT INTO sensor_readings (
      id, hive_id, timestamp, temperature, humidity, weight,
      acoustic_hz, foraging_rate, battery_pct, rssi_dbm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const readings = generateReadings(hiveId, 24, profile);
  const insertAll = db.transaction(() => {
    for (const r of readings) {
      insertReading.run(
        uuidv4(), hiveId, r.timestamp, r.temperature, r.humidity, r.weight,
        r.acoustic_hz ?? 215, r.foraging_rate ?? 48, r.battery_pct ?? 96, r.rssi_dbm ?? -68
      );
    }
  });
  insertAll();

  const hiveRow = db.prepare('SELECT * FROM hives WHERE id = ?').get(hiveId);
  const enriched = enrichHive(hiveRow);
  evaluateHiveReadings(hiveRow, enriched.readings, enriched.health);
  return true;
}

function run() {
  const created = [];
  const skipped = [];
  const note = (label, wasCreated) => (wasCreated ? created : skipped).push(label);

  note('beekeeper profile: Ramesh Patil', ensureBeekeeper({
    id: 'BK-RAMESH', name: 'Ramesh Patil', district: 'Pune', state: 'Maharashtra', phone: '9800000000', verified: 1,
  }));
  note('apiary: AP-MAIN', ensureApiary({
    id: 'AP-MAIN', beekeeperId: 'BK-RAMESH', name: 'Sahyadri Highland Apiary', location: 'Pune, Maharashtra', lat: 18.5204, lng: 73.8567,
  }));
  note('login: ramesh@honeychain.demo', ensureUser({
    id: 'U-RAMESH', email: 'ramesh@honeychain.demo', password: DEMO_PASSWORD.beekeeper, role: 'beekeeper', beekeeperId: 'BK-RAMESH',
  }));

  const hiveProfiles = [
    ['H-001', 'healthy', 'Apis cerana'],
    ['H-002', 'healthy', 'Apis cerana'],
    ['H-003', 'healthy', 'Apis mellifera'],
    ['H-004', 'healthy', 'Apis mellifera'],
    ['H-005', 'attention', 'Apis cerana'],
    ['H-006', 'critical', 'Apis cerana'],
  ];
  for (const [hiveId, profile, species] of hiveProfiles) {
    note(`hive: ${hiveId}`, ensureHiveWithReadings(hiveId, 'AP-MAIN', 'BK-RAMESH', profile, species));
  }

  note('beekeeper profile: Sunita Kale', ensureBeekeeper({
    id: 'BK-SUNITA', name: 'Sunita Kale', district: 'Nashik', state: 'Maharashtra', phone: '9900011122', verified: 0,
  }));
  note('apiary: AP-NASHIK', ensureApiary({
    id: 'AP-NASHIK', beekeeperId: 'BK-SUNITA', name: 'Godavari Valley Apiary', location: 'Nashik, Maharashtra', lat: 19.9975, lng: 73.7898,
  }));
  note('login: sunita@honeychain.demo', ensureUser({
    id: 'U-SUNITA', email: 'sunita@honeychain.demo', password: DEMO_PASSWORD.beekeeper, role: 'beekeeper', beekeeperId: 'BK-SUNITA',
  }));

  note('login: lab@honeychain.demo', ensureUser({
    id: 'U-LAB', email: 'lab@honeychain.demo', password: DEMO_PASSWORD.lab, role: 'lab',
  }));
  note('login: admin@honeychain.demo', ensureUser({
    id: 'U-ADMIN', email: 'admin@honeychain.demo', password: DEMO_PASSWORD.admin, role: 'admin',
  }));

  console.log(`Seed run complete. Created ${created.length}, already present ${skipped.length}.`);
}

run();
