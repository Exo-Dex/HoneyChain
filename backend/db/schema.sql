-- Honey Chain Real-Time Telemetry, ESP32 Hardware Ingestion, Analytics & Traceability Schema

CREATE TABLE IF NOT EXISTS beekeepers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT,
  state TEXT,
  phone TEXT UNIQUE,
  verified INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('beekeeper', 'lab', 'admin')),
  beekeeper_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (beekeeper_id) REFERENCES beekeepers(id)
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
  status TEXT DEFAULT 'ACTIVE',
  sim_profile TEXT DEFAULT 'healthy',
  telemetry_source TEXT DEFAULT 'SIMULATION' CHECK (telemetry_source IN ('SIMULATION', 'ESP32')),
  device_id TEXT,
  last_telemetry_at TEXT,
  installed_at TEXT,
  FOREIGN KEY (apiary_id) REFERENCES apiaries(id),
  FOREIGN KEY (beekeeper_id) REFERENCES beekeepers(id)
);

CREATE TABLE IF NOT EXISTS iot_devices (
  device_id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL,
  firmware_version TEXT DEFAULT 'v2.1.0-esp32',
  ip_address TEXT,
  rssi_dbm INTEGER,
  battery_pct REAL,
  last_seen_at TEXT,
  status TEXT DEFAULT 'ONLINE',
  FOREIGN KEY (hive_id) REFERENCES hives(id)
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  temperature REAL,
  humidity REAL,
  weight REAL,
  acoustic_hz REAL DEFAULT 215.0,
  foraging_rate INTEGER DEFAULT 48,
  battery_pct REAL DEFAULT 96.0,
  rssi_dbm INTEGER DEFAULT -68,
  source TEXT DEFAULT 'SIMULATION' CHECK (source IN ('SIMULATION', 'ESP32')),
  device_id TEXT,
  FOREIGN KEY (hive_id) REFERENCES hives(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  hive_id TEXT,
  batch_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metric_name TEXT,
  metric_value REAL,
  threshold_value REAL,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
  acknowledged_by TEXT,
  resolved_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (hive_id) REFERENCES hives(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS health_scores (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  score INTEGER,
  status TEXT,
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
  hive_ids TEXT NOT NULL,
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
  status TEXT DEFAULT 'CREATED',
  created_at TEXT NOT NULL,
  FOREIGN KEY (harvest_id) REFERENCES harvests(id)
);

CREATE TABLE IF NOT EXISTS batch_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  batch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  payload TEXT,
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
  result TEXT,
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

CREATE INDEX IF NOT EXISTS idx_apiaries_beekeeper ON apiaries(beekeeper_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_beekeeper ON users(beekeeper_id);
CREATE INDEX IF NOT EXISTS idx_hives_beekeeper ON hives(beekeeper_id);
CREATE INDEX IF NOT EXISTS idx_hives_apiary ON hives(apiary_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_hive ON sensor_readings(hive_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, severity, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_hive ON alerts(hive_id, status);
CREATE INDEX IF NOT EXISTS idx_harvests_beekeeper ON harvests(beekeeper_id);
CREATE INDEX IF NOT EXISTS idx_batches_harvest ON batches(harvest_id);
CREATE INDEX IF NOT EXISTS idx_batch_events_batch ON batch_events(batch_id, seq);
CREATE INDEX IF NOT EXISTS idx_quality_tests_batch ON quality_tests(batch_id);
CREATE INDEX IF NOT EXISTS idx_products_batch ON products(batch_id);

CREATE TRIGGER IF NOT EXISTS trg_batch_events_no_update
BEFORE UPDATE ON batch_events
BEGIN
  SELECT RAISE(ABORT, 'batch_events is append-only: UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS trg_batch_events_no_delete
BEFORE DELETE ON batch_events
BEGIN
  SELECT RAISE(ABORT, 'batch_events is append-only: DELETE is not permitted');
END;
