const db = require('../db/db');
const { computeHealthScore, predictYield } = require('./ai');

function enrichHive(hive) {
  const readings = db.prepare(
    'SELECT * FROM sensor_readings WHERE hive_id = ? ORDER BY timestamp ASC'
  ).all(hive.id);

  const health = computeHealthScore(readings);
  const yield_prediction = predictYield(readings, health);
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;

  return { ...hive, readings, latest_reading: latest, health, yield_prediction };
}

function enrichHiveSummary(hive) {
  const { readings, ...rest } = enrichHive(hive);
  const sparkline = readings.slice(-12).map(r => ({
    timestamp: r.timestamp,
    temperature: r.temperature,
    humidity: r.humidity,
    weight: r.weight,
    acoustic_hz: r.acoustic_hz,
  }));
  return {
    ...rest,
    health_status: rest.health.status,
    health_score: rest.health.score,
    sparkline,
  };
}

module.exports = { enrichHive, enrichHiveSummary };
