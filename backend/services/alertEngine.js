/**
 * Real-Time Alerting & Anomaly Detection Engine
 *
 * Evaluates live telemetry readings and lab quality events against configurable
 * operational thresholds, manages deduplication of active incidents, and supports
 * acknowledgment and resolution workflows.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db/db');

let thresholds = {
  temp_max: 36.0,
  temp_critical: 39.5,
  temp_min: 30.0,
  humidity_max: 70.0,
  humidity_critical: 78.0,
  humidity_min: 48.0,
  acoustic_warning: 280.0,
  acoustic_critical: 320.0,
  weight_drop_pct_warning: -3.5,
  weight_drop_pct_critical: -5.0,
  battery_low: 25.0,
};

function getThresholds() {
  return { ...thresholds };
}

function updateThresholds(newValues = {}) {
  thresholds = {
    ...thresholds,
    ...Object.fromEntries(
      Object.entries(newValues)
        .filter(([k, v]) => k in thresholds && typeof v === 'number' && !Number.isNaN(v))
    ),
  };
  return getThresholds();
}

function upsertAlert({ hive_id = null, batch_id = null, severity, category, title, message, metric_name, metric_value, threshold_value }) {
  const now = new Date().toISOString();
  const existing = db.prepare(`
    SELECT * FROM alerts
    WHERE COALESCE(hive_id, '') = COALESCE(?, '')
      AND COALESCE(batch_id, '') = COALESCE(?, '')
      AND category = ?
      AND status IN ('ACTIVE', 'ACKNOWLEDGED')
    ORDER BY created_at DESC LIMIT 1
  `).get(hive_id, batch_id, category);

  if (existing) {
    db.prepare(`
      UPDATE alerts
      SET severity = ?, title = ?, message = ?, metric_value = ?, threshold_value = ?, updated_at = ?
      WHERE id = ?
    `).run(severity, title, message, metric_value, threshold_value, now, existing.id);
    return { ...existing, severity, title, message, metric_value, threshold_value, updated_at: now, is_new: false };
  }

  const id = 'ALT-' + uuidv4().slice(0, 8).toUpperCase();
  db.prepare(`
    INSERT INTO alerts (
      id, hive_id, batch_id, severity, category, title, message,
      metric_name, metric_value, threshold_value, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(
    id, hive_id, batch_id, severity, category, title, message,
    metric_name || null, metric_value ?? null, threshold_value ?? null, now, now
  );

  return {
    id, hive_id, batch_id, severity, category, title, message,
    metric_name, metric_value, threshold_value, status: 'ACTIVE',
    created_at: now, updated_at: now, is_new: true,
  };
}

function evaluateHiveReadings(hive, readings, health) {
  if (!readings || readings.length === 0) return [];
  const latest = readings[readings.length - 1];
  const generated = [];

  // 1. Temperature anomaly check
  if (latest.temperature >= thresholds.temp_critical) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'CRITICAL',
      category: 'THERMAL_SPIKE',
      title: `${hive.id}: Critical Brood Overheating (${latest.temperature}°C)`,
      message: `Internal brood temperature reached ${latest.temperature}°C (critical threshold ${thresholds.temp_critical}°C). Risk of brood mortality or wax comb collapse.`,
      metric_name: 'temperature',
      metric_value: latest.temperature,
      threshold_value: thresholds.temp_critical,
    }));
  } else if (latest.temperature > thresholds.temp_max) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'WARNING',
      category: 'THERMAL_SPIKE',
      title: `${hive.id}: Elevated Hive Temperature (${latest.temperature}°C)`,
      message: `Temperature ${latest.temperature}°C exceeds optimal brood range (${thresholds.temp_min}–${thresholds.temp_max}°C). Colony ventilation fanning active.`,
      metric_name: 'temperature',
      metric_value: latest.temperature,
      threshold_value: thresholds.temp_max,
    }));
  }

  // 2. Humidity anomaly check
  if (latest.humidity >= thresholds.humidity_critical) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'CRITICAL',
      category: 'HUMIDITY_HIGH',
      title: `${hive.id}: Excessive Humidity & Fermentation Risk (${latest.humidity}%)`,
      message: `Relative humidity at ${latest.humidity}% exceeds critical threshold (${thresholds.humidity_critical}%). Uncapped nectar faces elevated moisture and yeast fermentation risk.`,
      metric_name: 'humidity',
      metric_value: latest.humidity,
      threshold_value: thresholds.humidity_critical,
    }));
  } else if (latest.humidity > thresholds.humidity_max) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'WARNING',
      category: 'HUMIDITY_HIGH',
      title: `${hive.id}: High Internal Humidity (${latest.humidity}%)`,
      message: `Relative humidity (${latest.humidity}%) is above the ${thresholds.humidity_max}% normal upper bound.`,
      metric_name: 'humidity',
      metric_value: latest.humidity,
      threshold_value: thresholds.humidity_max,
    }));
  }

  // 3. Weight loss / swarming / robbing check
  if (readings.length >= 3) {
    const first = readings[0].weight;
    const pctChange = first > 0 ? ((latest.weight - first) / first) * 100 : 0;
    if (pctChange <= thresholds.weight_drop_pct_critical) {
      generated.push(upsertAlert({
        hive_id: hive.id,
        severity: 'CRITICAL',
        category: 'WEIGHT_DROP',
        title: `${hive.id}: Rapid Weight Loss (${pctChange.toFixed(1)}%) — Swarming/Robbing Alert`,
        message: `Hive mass dropped from ${first} kg to ${latest.weight} kg (${pctChange.toFixed(1)}%). Immediate physical inspection recommended for absconding, swarming, or honey robbing.`,
        metric_name: 'weight_pct_change',
        metric_value: Math.round(pctChange * 10) / 10,
        threshold_value: thresholds.weight_drop_pct_critical,
      }));
    } else if (pctChange <= thresholds.weight_drop_pct_warning) {
      generated.push(upsertAlert({
        hive_id: hive.id,
        severity: 'WARNING',
        category: 'WEIGHT_DROP',
        title: `${hive.id}: Downward Weight Trend (${pctChange.toFixed(1)}%)`,
        message: `Hive weight declined ${Math.abs(pctChange).toFixed(1)}% over the monitoring window. Check nectar forage availability.`,
        metric_name: 'weight_pct_change',
        metric_value: Math.round(pctChange * 10) / 10,
        threshold_value: thresholds.weight_drop_pct_warning,
      }));
    }
  }

  // 4. Acoustic anomaly check
  const acoustic = latest.acoustic_hz ?? 215;
  if (acoustic >= thresholds.acoustic_critical) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'CRITICAL',
      category: 'ACOUSTIC_SWARM',
      title: `${hive.id}: High-Frequency Acoustic Agitation (${Math.round(acoustic)} Hz)`,
      message: `Colony audio spectrum peaked at ${Math.round(acoustic)} Hz (critical limit ${thresholds.acoustic_critical} Hz), characteristic of pre-swarming piping or predator disturbance.`,
      metric_name: 'acoustic_hz',
      metric_value: Math.round(acoustic),
      threshold_value: thresholds.acoustic_critical,
    }));
  } else if (acoustic >= thresholds.acoustic_warning) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'WARNING',
      category: 'ACOUSTIC_SWARM',
      title: `${hive.id}: Elevated Colony Buzz (${Math.round(acoustic)} Hz)`,
      message: `Acoustic frequency (${Math.round(acoustic)} Hz) exceeds normal 190–260 Hz brood hum.`,
      metric_name: 'acoustic_hz',
      metric_value: Math.round(acoustic),
      threshold_value: thresholds.acoustic_warning,
    }));
  }

  // 5. Battery / IoT node health check
  if ((latest.battery_pct ?? 100) <= thresholds.battery_low) {
    generated.push(upsertAlert({
      hive_id: hive.id,
      severity: 'WARNING',
      category: 'IOT_NODE_HEALTH',
      title: `${hive.id}: Low ESP32 Sensor Battery (${latest.battery_pct}%)`,
      message: `Solar charging underperforming on node ${hive.id} (RSSI ${latest.rssi_dbm ?? -82} dBm). Schedule battery maintenance.`,
      metric_name: 'battery_pct',
      metric_value: latest.battery_pct,
      threshold_value: thresholds.battery_low,
    }));
  }

  // Auto-resolve active telemetry alerts if hive returned to Healthy state
  if (health && health.status === 'Healthy' && generated.length === 0) {
    db.prepare(`
      UPDATE alerts
      SET status = 'RESOLVED', resolved_note = 'Auto-resolved: telemetry returned within normal range.', updated_at = ?
      WHERE hive_id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED')
    `).run(new Date().toISOString(), hive.id);
  }

  return generated;
}

module.exports = {
  getThresholds,
  updateThresholds,
  upsertAlert,
  evaluateHiveReadings,
};
