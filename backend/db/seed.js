require('dotenv').config();
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { generateReadings } = require('../services/simulator');
const { hashPassword } = require('../services/auth');

const DEMO_PASSWORD = {
  beekeeper: 'beekeeper123',
  lab: 'lab123456',
  admin: 'admin12345',
};

function run() {
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing.c > 0) {
    console.log('Seed skipped: data already present. Delete backend/db/honeychain.db to reseed.');
    return;
  }

  const now = new Date().toISOString();

  // ── Beekeeper #1: Ramesh Patil - pre-verified, so the main demo works
  // immediately without needing an approval step first. ────────────────────
  const beekeeperId = 'BK-RAMESH';
  db.prepare(`
    INSERT INTO beekeepers (id, name, district, state, phone, verified)
    VALUES (?, 'Ramesh Patil', 'Pune', 'Maharashtra', '9800000000', 1)
  `).run(beekeeperId);

  const apiaryId = 'AP-MAIN';
  db.prepare(`
    INSERT INTO apiaries (id, beekeeper_id, name, location, lat, lng)
    VALUES (?, ?, 'Main Apiary', 'Pune, Maharashtra', 18.5204, 73.8567)
  `).run(apiaryId, beekeeperId);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, beekeeper_id, created_at)
    VALUES (?, 'ramesh@honeychain.demo', ?, 'beekeeper', ?, ?)
  `).run('U-RAMESH', hashPassword(DEMO_PASSWORD.beekeeper), beekeeperId, now);

  const hiveProfiles = [
    ['H-001', 'healthy'],
    ['H-002', 'healthy'],
    ['H-003', 'healthy'],
    ['H-004', 'healthy'],
    ['H-005', 'attention'],
    ['H-006', 'critical'],
  ];

  const insertHive = db.prepare(`
    INSERT INTO hives (id, apiary_id, beekeeper_id, species, status, installed_at)
    VALUES (?, ?, ?, 'Apis cerana', 'ACTIVE', ?)
  `);
  const insertReading = db.prepare(`
    INSERT INTO sensor_readings (id, hive_id, timestamp, temperature, humidity, weight)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedHives = db.transaction(() => {
    for (const [hiveId, profile] of hiveProfiles) {
      insertHive.run(hiveId, apiaryId, beekeeperId, now);
      const readings = generateReadings(hiveId, 24, profile);
      for (const r of readings) {
        insertReading.run(uuidv4(), hiveId, r.timestamp, r.temperature, r.humidity, r.weight);
      }
    }
  });
  seedHives();

  // ── Beekeeper #2: Sunita Kale - deliberately left UNVERIFIED, so there's
  // something for the admin account to approve during a demo without having
  // to register a brand-new account live first. ────────────────────────────
  const beekeeper2Id = 'BK-SUNITA';
  db.prepare(`
    INSERT INTO beekeepers (id, name, district, state, phone, verified)
    VALUES (?, 'Sunita Kale', 'Nashik', 'Maharashtra', '9900011122', 0)
  `).run(beekeeper2Id);

  const apiary2Id = 'AP-NASHIK';
  db.prepare(`
    INSERT INTO apiaries (id, beekeeper_id, name, location)
    VALUES (?, ?, 'Nashik Apiary', 'Nashik, Maharashtra')
  `).run(apiary2Id, beekeeper2Id);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, beekeeper_id, created_at)
    VALUES (?, 'sunita@honeychain.demo', ?, 'beekeeper', ?, ?)
  `).run('U-SUNITA', hashPassword(DEMO_PASSWORD.beekeeper), beekeeper2Id, now);

  // ── Lab and Admin accounts - provisioned here, not via any in-app UI
  // (Decision: manual/seed-script is fine for staff accounts). ─────────────
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, beekeeper_id, created_at)
    VALUES ('U-LAB', 'lab@honeychain.demo', ?, 'lab', NULL, ?)
  `).run(hashPassword(DEMO_PASSWORD.lab), now);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, beekeeper_id, created_at)
    VALUES ('U-ADMIN', 'admin@honeychain.demo', ?, 'admin', NULL, ?)
  `).run(hashPassword(DEMO_PASSWORD.admin), now);

  console.log('Seed complete.\n');
  console.log('Demo login credentials:');
  console.log('------------------------------------------------------------');
  console.log('  Beekeeper (verified):    ramesh@honeychain.demo / beekeeper123');
  console.log('  Beekeeper (unverified):  sunita@honeychain.demo / beekeeper123');
  console.log('  Lab / Processing:        lab@honeychain.demo    / lab123456');
  console.log('  Cluster Admin:           admin@honeychain.demo  / admin12345');
  console.log('------------------------------------------------------------');
  console.log(`  Ramesh's hives: ${hiveProfiles.map(h => h[0]).join(', ')}`);
}

run();
