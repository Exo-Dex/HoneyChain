const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/db');
const { computeHealthScore, predictYield } = require('./ai');
const { evaluateHiveReadings } = require('./alertEngine');

const PROFILES = {
  healthy: {
    temp: 33.4, hum: 59.0, weight: 31.2, acoustic: 215, foraging: 64, battery: 96, rssi: -64,
    tempDrift: 0.45, humDrift: 1.6, weightTrend: 0.28, acousticDrift: 8,
  },
  attention: {
    temp: 37.8, hum: 74.5, weight: 28.4, acoustic: 286, foraging: 34, battery: 84, rssi: -74,
    tempDrift: 0.5, humDrift: 1.5, weightTrend: -0.06, acousticDrift: 12,
  },
  critical: {
    temp: 41.2, hum: 82.0, weight: 25.8, acoustic: 342, foraging: 14, battery: 72, rssi: -81,
    tempDrift: 0.55, humDrift: 1.5, weightTrend: -0.65, acousticDrift: 18,
  },
  swarm_risk: {
    temp: 36.8, hum: 66.0, weight: 24.5, acoustic: 358, foraging: 92, battery: 91, rssi: -69,
    tempDrift: 0.6, humDrift: 1.8, weightTrend: -0.85, acousticDrift: 22,
  },
  fermentation_risk: {
    temp: 35.2, hum: 83.5, weight: 32.0, acoustic: 248, foraging: 40, battery: 89, rssi: -71,
    tempDrift: 0.4, humDrift: 1.4, weightTrend: 0.1, acousticDrift: 10,
  },
};

function generateReadings(hiveId, hours = 24, profile = 'healthy') {
  const readings = [];
  const now = Date.now();
  const base = PROFILES[profile] || PROFILES.healthy;

  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now - i * 60 * 60 * 1000).toISOString();
    const jitter = () => (Math.random() - 0.5) * 2;
    const progress = hours - i;

    const temperature = Math.round((base.temp + jitter() * base.tempDrift) * 10) / 10;
    const humidity = Math.round((base.hum + jitter() * base.humDrift) * 10) / 10;
    const weight = Math.round((base.weight + progress * base.weightTrend + jitter() * 0.25) * 10) / 10;
    const acoustic_hz = Math.round((base.acoustic + jitter() * base.acousticDrift) * 10) / 10;
    const foraging_rate = Math.max(0, Math.round(base.foraging + jitter() * 12));
    const battery_pct = Math.max(5, Math.min(100, Math.round((base.battery - progress * 0.05 + jitter() * 0.4) * 10) / 10));
    const rssi_dbm = Math.round(base.rssi + jitter() * 3);

    readings.push({
      id: uuidv4(),
      hive_id: hiveId,
      timestamp,
      temperature,
      humidity,
      weight,
      acoustic_hz,
      foraging_rate,
      battery_pct,
      rssi_dbm,
      source: 'SIMULATION',
      device_id: null,
    });
  }

  return readings;
}

function generateNextReading(hive, lastReading) {
  const profileName = hive.sim_profile || 'healthy';
  const base = PROFILES[profileName] || PROFILES.healthy;
  const jitter = () => (Math.random() - 0.5) * 2;

  const prevTemp = lastReading ? lastReading.temperature : base.temp;
  const prevHum = lastReading ? lastReading.humidity : base.hum;
  const prevWeight = lastReading ? lastReading.weight : base.weight;
  const prevAcoustic = lastReading?.acoustic_hz ?? base.acoustic;
  const prevBattery = lastReading?.battery_pct ?? base.battery;

  const temperature = Math.round((prevTemp + (base.temp - prevTemp) * 0.35 + jitter() * base.tempDrift * 0.7) * 10) / 10;
  const humidity = Math.round((prevHum + (base.hum - prevHum) * 0.35 + jitter() * base.humDrift * 0.7) * 10) / 10;
  const weightStep = base.weightTrend * 0.12 + jitter() * 0.08;
  const weight = Math.max(10, Math.round((prevWeight + weightStep) * 100) / 100);
  const acoustic_hz = Math.round((prevAcoustic + (base.acoustic - prevAcoustic) * 0.4 + jitter() * base.acousticDrift * 0.6) * 10) / 10;
  const foraging_rate = Math.max(0, Math.round(base.foraging + jitter() * 10));
  const battery_pct = Math.max(5, Math.min(100, Math.round((prevBattery + jitter() * 0.2) * 10) / 10));
  const rssi_dbm = Math.round(base.rssi + jitter() * 2);

  return {
    id: uuidv4(),
    hive_id: hive.id,
    timestamp: new Date().toISOString(),
    temperature,
    humidity,
    weight,
    acoustic_hz,
    foraging_rate,
    battery_pct,
    rssi_dbm,
    source: 'SIMULATION',
    device_id: null,
  };
}

class LiveTelemetryEngine extends EventEmitter {
  constructor() {
    super();
    // mode: 'SIMULATION' | 'ESP32_LIVE' | 'HYBRID'
    this.mode = process.env.TELEMETRY_MODE || 'SIMULATION';
    this.running = false;
    this.intervalMs = 3000;
    this.timer = null;
    this.tickCount = 0;
    this.esp32PacketsReceived = 0;
    this.lastEsp32PacketAt = null;
  }

  setMode(newMode) {
    if (!['SIMULATION', 'ESP32_LIVE', 'HYBRID'].includes(newMode)) {
      throw new Error("Invalid telemetry mode. Must be 'SIMULATION', 'ESP32_LIVE', or 'HYBRID'.");
    }
    this.mode = newMode;
    if (newMode === 'ESP32_LIVE') {
      // In pure ESP32_LIVE mode, pause synthetic background ticks so only physical ESP32 readings appear
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.running = false;
    } else if (!this.running) {
      this.start(this.intervalMs);
    }
    this.emit('state', this.getState());
    return this.getState();
  }

  start(intervalMs = this.intervalMs) {
    this.intervalMs = intervalMs;
    if (this.timer) clearInterval(this.timer);
    this.running = true;
    this.timer = setInterval(() => {
      try {
        if (this.mode !== 'ESP32_LIVE') {
          this.stepOnce();
        }
      } catch (err) {
        console.error('Simulation tick error:', err.message);
      }
    }, this.intervalMs);
    this.emit('state', this.getState());
  }

  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.emit('state', this.getState());
  }

  setSpeed(intervalMs) {
    const clamped = Math.max(500, Math.min(10000, Number(intervalMs) || 3000));
    this.intervalMs = clamped;
    if (this.running) {
      this.start(clamped);
    } else {
      this.emit('state', this.getState());
    }
  }

  getState() {
    return {
      mode: this.mode,
      running: this.running,
      interval_ms: this.intervalMs,
      tick_count: this.tickCount,
      esp32_packets_received: this.esp32PacketsReceived,
      last_esp32_packet_at: this.lastEsp32PacketAt,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Ingest a real sensor reading packet from an ESP32 node (via HTTP POST, MQTT bridge, or USB Serial bridge).
   */
  ingestHardwareReading(packet, clientIp = null) {
    const {
      hive_id,
      device_id = `ESP32-${hive_id}`,
      temperature,
      humidity,
      weight,
      acoustic_hz = 215.0,
      foraging_rate = 50,
      battery_pct = 95.0,
      rssi_dbm = -65,
      firmware_version = 'v2.1.0-esp32',
      timestamp,
    } = packet || {};

    if (!hive_id || temperature == null || humidity == null || weight == null) {
      throw new Error('hive_id, temperature, humidity, and weight are required in ESP32 payload.');
    }

    const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(hive_id);
    if (!hive) {
      throw new Error(`Unknown hive_id: ${hive_id}`);
    }

    const nowIso = timestamp || new Date().toISOString();
    const readingId = uuidv4();

    const readingRow = {
      id: readingId,
      hive_id: hive.id,
      timestamp: nowIso,
      temperature: Math.round(Number(temperature) * 10) / 10,
      humidity: Math.round(Number(humidity) * 10) / 10,
      weight: Math.round(Number(weight) * 100) / 100,
      acoustic_hz: Math.round(Number(acoustic_hz) * 10) / 10,
      foraging_rate: Math.round(Number(foraging_rate)),
      battery_pct: Math.round(Number(battery_pct) * 10) / 10,
      rssi_dbm: Math.round(Number(rssi_dbm)),
      source: 'ESP32',
      device_id,
    };

    let health;
    let yield_prediction;
    let alerts = [];

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO sensor_readings (
          id, hive_id, timestamp, temperature, humidity, weight,
          acoustic_hz, foraging_rate, battery_pct, rssi_dbm, source, device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ESP32', ?)
      `).run(
        readingRow.id, readingRow.hive_id, readingRow.timestamp,
        readingRow.temperature, readingRow.humidity, readingRow.weight,
        readingRow.acoustic_hz, readingRow.foraging_rate, readingRow.battery_pct,
        readingRow.rssi_dbm, readingRow.device_id
      );

      db.prepare(`
        UPDATE hives
        SET telemetry_source = 'ESP32', device_id = ?, last_telemetry_at = ?
        WHERE id = ?
      `).run(device_id, nowIso, hive.id);

      db.prepare(`
        INSERT INTO iot_devices (device_id, hive_id, firmware_version, ip_address, rssi_dbm, battery_pct, last_seen_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ONLINE')
        ON CONFLICT(device_id) DO UPDATE SET
          hive_id = excluded.hive_id,
          firmware_version = excluded.firmware_version,
          ip_address = COALESCE(excluded.ip_address, iot_devices.ip_address),
          rssi_dbm = excluded.rssi_dbm,
          battery_pct = excluded.battery_pct,
          last_seen_at = excluded.last_seen_at,
          status = 'ONLINE'
      `).run(device_id, hive.id, firmware_version, clientIp, readingRow.rssi_dbm, readingRow.battery_pct, nowIso);

      const readings = db.prepare(
        'SELECT * FROM sensor_readings WHERE hive_id = ? ORDER BY timestamp ASC'
      ).all(hive.id);

      health = computeHealthScore(readings);
      yield_prediction = predictYield(readings, health);
      alerts = evaluateHiveReadings(hive, readings, health);
    });

    tx();

    this.esp32PacketsReceived += 1;
    this.lastEsp32PacketAt = nowIso;
    this.tickCount += 1;

    const eventPayload = {
      tick: this.tickCount,
      source: 'ESP32',
      device_id,
      timestamp: nowIso,
      updates: [{
        hive_id: hive.id,
        telemetry_source: 'ESP32',
        device_id,
        latest: readingRow,
        health,
        yield_prediction,
      }],
      new_alerts: alerts.filter(a => a.is_new),
    };

    this.emit('tick', eventPayload);
    this.emit('esp32_packet', eventPayload);
    return eventPayload;
  }

  stepOnce(targetHiveId = null) {
    let hives = targetHiveId
      ? db.prepare('SELECT * FROM hives WHERE id = ?').all(targetHiveId)
      : db.prepare("SELECT * FROM hives WHERE status = 'ACTIVE'").all();

    // In HYBRID mode, skip synthetic readings for hives configured for real ESP32 hardware
    if (this.mode === 'HYBRID' && !targetHiveId) {
      hives = hives.filter(h => h.telemetry_source !== 'ESP32');
    }

    if (!hives.length) return null;

    const insertReading = db.prepare(`
      INSERT INTO sensor_readings (
        id, hive_id, timestamp, temperature, humidity, weight,
        acoustic_hz, foraging_rate, battery_pct, rssi_dbm, source, device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATION', NULL)
    `);

    const pruneOld = db.prepare(`
      DELETE FROM sensor_readings
      WHERE hive_id = ? AND id NOT IN (
        SELECT id FROM sensor_readings WHERE hive_id = ? ORDER BY timestamp DESC LIMIT 48
      )
    `);

    const updates = [];
    const triggeredAlerts = [];

    const runTick = db.transaction(() => {
      for (const hive of hives) {
        const last = db.prepare(
          'SELECT * FROM sensor_readings WHERE hive_id = ? ORDER BY timestamp DESC LIMIT 1'
        ).get(hive.id);

        const next = generateNextReading(hive, last);
        insertReading.run(
          next.id, next.hive_id, next.timestamp, next.temperature,
          next.humidity, next.weight, next.acoustic_hz, next.foraging_rate,
          next.battery_pct, next.rssi_dbm
        );
        pruneOld.run(hive.id, hive.id);

        const readings = db.prepare(
          'SELECT * FROM sensor_readings WHERE hive_id = ? ORDER BY timestamp ASC'
        ).all(hive.id);

        const health = computeHealthScore(readings);
        const yield_prediction = predictYield(readings, health);
        const alerts = evaluateHiveReadings(hive, readings, health);

        updates.push({
          hive_id: hive.id,
          telemetry_source: hive.telemetry_source || 'SIMULATION',
          sim_profile: hive.sim_profile || 'healthy',
          latest: next,
          health,
          yield_prediction,
        });
        for (const a of alerts) {
          if (a.is_new) triggeredAlerts.push(a);
        }
      }
    });

    runTick();
    this.tickCount += 1;

    const payload = {
      tick: this.tickCount,
      source: 'SIMULATION',
      timestamp: new Date().toISOString(),
      updates,
      new_alerts: triggeredAlerts,
    };

    this.emit('tick', payload);
    return payload;
  }
}

const liveSimulator = new LiveTelemetryEngine();

module.exports = {
  generateReadings,
  generateNextReading,
  liveSimulator,
  PROFILES,
};
