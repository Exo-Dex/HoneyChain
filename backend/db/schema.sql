-- Honey Chain MVP schema
-- Deliberately small: one row per real-world entity, event ledger carries the "blockchain" story.

CREATE TABLE IF NOT EXISTS beekeepers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT,
  state TEXT,
  phone TEXT,
  verified INTEGER DEFAULT 1 -- demo: pre-verified
);

CREATE TABLE IF NOT EXISTS apiaries (
  id TEXT PRIMARY KEY,
  beekeeper_id TEXT NOT NULL,
  name TEXT,
  location TEXT,
  lat REAL,
  lng REAL,
  FOREIGN KEY (beekeeper_id) REFERENCES beekeepers(id)
);

CREATE TABLE IF NOT EXISTS hives (
  id TEXT PRIMARY KEY,
  apiary_id TEXT NOT NULL,
  beekeeper_id TEXT NOT NULL,
  species TEXT DEFAULT 'Apis cerana',
  status TEXT DEFAULT 'ACTIVE', -- REGISTERED, ACTIVE, INSPECTION, RETIRED
  installed_at TEXT,
  FOREIGN KEY (apiary_id) REFERENCES apiaries(id),
  FOREIGN KEY (beekeeper_id) REFERENCES beekeepers(id)
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  temperature REAL,
  humidity REAL,
  weight REAL,
  FOREIGN KEY (hive_id) REFERENCES hives(id)
);

CREATE TABLE IF NOT EXISTS health_scores (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  score INTEGER,
  status TEXT, -- Healthy, Attention, Critical
  reason TEXT,
  FOREIGN KEY (hive_id) REFERENCES hives(id)
);

CREATE TABLE IF NOT EXISTS yield_predictions (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  predicted_kg REAL,
  confidence REAL,
  explanation TEXT,
  FOREIGN KEY (hive_id) REFERENCES hives(id)
);

CREATE TABLE IF NOT EXISTS harvests (
  id TEXT PRIMARY KEY,
  hive_ids TEXT NOT NULL, -- JSON array of hive ids
  beekeeper_id TEXT NOT NULL,
  date TEXT NOT NULL,
  quantity_kg REAL NOT NULL,
  floral_source TEXT,
  location TEXT,
  FOREIGN KEY (beekeeper_id) REFERENCES beekeepers(id)
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  batch_code TEXT UNIQUE NOT NULL,
  harvest_id TEXT NOT NULL,
  status TEXT DEFAULT 'CREATED', -- CREATED, RECEIVED, TESTED, PROCESSED, PACKAGED, QUARANTINED
  created_at TEXT NOT NULL,
  FOREIGN KEY (harvest_id) REFERENCES harvests(id)
);

-- The "blockchain": an append-only, hash-chained event ledger.
-- Each row's hash = SHA256(prev_hash + canonical(event fields)).
-- Tampering with any row breaks every hash after it - independently verifiable.
CREATE TABLE IF NOT EXISTS batch_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,           -- global sequence number (chain order)
  batch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,       -- HARVEST_RECORDED, BATCH_CREATED, BATCH_RECEIVED, BATCH_TESTED, BATCH_PROCESSED, BATCH_PACKAGED, QR_ACTIVATED
  actor TEXT,
  payload TEXT,                   -- JSON blob of event-specific data
  timestamp TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS quality_tests (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  moisture REAL,
  hmf REAL,
  c4_sugar REAL,
  result TEXT, -- PASS / FAIL
  is_simulated INTEGER DEFAULT 1,
  tested_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  qr_token TEXT UNIQUE NOT NULL,
  activated_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);
