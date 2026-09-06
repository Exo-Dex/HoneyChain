const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { generateReadings } = require('../services/simulator');

function run() {
  const existing = db.prepare('SELECT COUNT(*) as c FROM beekeepers').get();
  if (existing.c > 0) {
    console.log('Seed skipped: data already present. Delete backend/db/honeychain.db to reseed.');
    return;
  }

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

  const installedAt = new Date().toISOString();

  const seedAll = db.transaction(() => {
    for (const [hiveId, profile] of hiveProfiles) {
      insertHive.run(hiveId, apiaryId, beekeeperId, installedAt);
      const readings = generateReadings(hiveId, 24, profile);
      for (const r of readings) {
        insertReading.run(uuidv4(), hiveId, r.timestamp, r.temperature, r.humidity, r.weight);
      }
    }
  });

  seedAll();

  console.log('Seed complete.');
  console.log(`  Beekeeper: ${beekeeperId} (Ramesh Patil)`);
  console.log(`  Apiary:    ${apiaryId}`);
  console.log(`  Hives:     ${hiveProfiles.map(h => h[0]).join(', ')}`);
}

run();
