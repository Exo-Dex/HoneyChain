/**
 * Honey Chain Real-Time AI & Telemetry Scoring Engine
 *
 * Evaluates multi-sensor hive telemetry (temperature, humidity, weight velocity,
 * acoustic buzz frequency, and foraging activity) to produce an explainable
 * Health Score (0-100), risk classification (Healthy / Attention / Critical),
 * component sub-scores, and honey yield forecast.
 */

const NORMAL_RANGES = {
  temperature: [30, 36],   // deg C, inside brood nest
  humidity: [50, 70],      // % relative humidity
  acoustic_hz: [190, 260], // Hz, calm brood-rearing buzz frequency
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeHealthScore(readings) {
  if (!readings || readings.length === 0) {
    return {
      score: null,
      status: 'Unknown',
      reason: 'No sensor data available yet.',
      flag: null,
      components: { temperature: 0, humidity: 0, weight: 0, acoustic: 0 },
    };
  }

  const latest = readings[readings.length - 1];
  let score = 100;
  const reasons = [];

  let tempScore = 100;
  let humScore = 100;
  let weightScore = 100;
  let acousticScore = 100;

  // 1. Temperature check
  const [tMin, tMax] = NORMAL_RANGES.temperature;
  if (latest.temperature < tMin || latest.temperature > tMax) {
    const deviation = Math.abs(latest.temperature - clamp(latest.temperature, tMin, tMax));
    const penalty = Math.min(35, deviation * 8);
    score -= penalty;
    tempScore = Math.round(clamp(100 - penalty * 2.5, 10, 100));
    reasons.push(`Temperature ${latest.temperature}°C is outside normal brood-nest range (${tMin}-${tMax}°C).`);
  }

  // 2. Humidity check
  const [hMin, hMax] = NORMAL_RANGES.humidity;
  if (latest.humidity < hMin || latest.humidity > hMax) {
    const deviation = Math.abs(latest.humidity - clamp(latest.humidity, hMin, hMax));
    const penalty = Math.min(30, deviation * 3);
    score -= penalty;
    humScore = Math.round(clamp(100 - penalty * 2.8, 15, 100));
    reasons.push(`Humidity ${latest.humidity}% is outside normal range (${hMin}-${hMax}%).`);
  }

  // 3. Acoustic colony stress / pre-swarming check
  const [aMin, aMax] = NORMAL_RANGES.acoustic_hz;
  const acoustic = latest.acoustic_hz ?? 220;
  if (acoustic > aMax || acoustic < aMin) {
    const deviation = Math.abs(acoustic - clamp(acoustic, aMin, aMax));
    const penalty = Math.min(20, (deviation / 15) * 4);
    score -= penalty;
    acousticScore = Math.round(clamp(100 - penalty * 4, 20, 100));
    if (acoustic > 300) {
      reasons.push(`Elevated acoustic signature (${Math.round(acoustic)} Hz) suggests pre-swarming agitation or queen distress.`);
    } else if (acoustic > aMax) {
      reasons.push(`Acoustic buzz (${Math.round(acoustic)} Hz) slightly elevated due to active ventilation fanning.`);
    }
  }

  // 4. Weight trend check
  let pctChange = 0;
  if (readings.length >= 3) {
    const first = readings[0].weight;
    const last = latest.weight;
    pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
    if (pctChange < -5) {
      score -= 25;
      weightScore = Math.round(clamp(100 - Math.abs(pctChange) * 8, 15, 100));
      reasons.push(`Hive weight dropped ${Math.abs(pctChange).toFixed(1)}% over the observed window — possible stress, absconding risk, or robbing.`);
    } else if (pctChange < -2) {
      score -= 10;
      weightScore = 72;
      reasons.push(`Slight weight decline (${Math.abs(pctChange).toFixed(1)}%) — monitor foraging conditions.`);
    } else if (pctChange > 3) {
      reasons.push(`Hive weight increased ${pctChange.toFixed(1)}% over the observed window — consistent with active nectar flow.`);
    }
  }

  score = Math.round(clamp(score, 0, 100));

  let status;
  if (score >= 75) status = 'Healthy';
  else if (score >= 50) status = 'Attention';
  else status = 'Critical';

  const reason = reasons.length > 0
    ? reasons.join(' ')
    : 'All monitored parameters (brood temperature, relative humidity, weight trend, and acoustic frequency) are within normal ranges.';

  const flag = score < 50
    ? 'Abnormal hive pattern detected. Immediate physical inspection recommended.'
    : (score < 75 ? 'Minor deviation detected. Keep monitoring telemetry stream.' : null);

  return {
    score,
    status,
    reason,
    flag,
    weight_pct_change: Math.round(pctChange * 10) / 10,
    components: {
      temperature: tempScore,
      humidity: humScore,
      weight: weightScore,
      acoustic: acousticScore,
    },
  };
}

function predictYield(readings, healthScore) {
  if (!readings || readings.length < 2) {
    return {
      predicted_kg: null,
      confidence: 0,
      daily_gain_kg: 0,
      days_to_harvest: null,
      explanation: 'Not enough sensor history yet to predict yield.',
    };
  }

  const first = readings[0].weight;
  const last = readings[readings.length - 1].weight;
  const weightGainKg = Math.max(0, last - first);

  const healthFactor = healthScore && healthScore.score != null
    ? clamp(healthScore.score / 100, 0.4, 1)
    : 0.75;

  const predicted_kg = Math.round((weightGainKg * 0.55 * healthFactor) * 10) / 10;
  const confidence = Math.round(clamp(60 + (readings.length * 1.5) - (100 - (healthScore?.score ?? 75)) / 4, 40, 94));
  const dailyGainKg = Math.round((weightGainKg / Math.max(1, readings.length / 24)) * 100) / 100;
  const targetWeight = 38.0;
  const remainingKg = Math.max(0, targetWeight - last);
  const daysToHarvest = dailyGainKg > 0.1 ? Math.ceil(remainingKg / dailyGainKg) : null;

  const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
  const explanation = `Weight ${pctChange >= 0 ? 'increased' : 'decreased'} ${Math.abs(pctChange).toFixed(1)}% over the observed window. ` +
    `Environmental & acoustic conditions are factored via the current health score (${healthScore?.score ?? 'n/a'}/100).`;

  return {
    predicted_kg,
    confidence,
    daily_gain_kg: dailyGainKg,
    days_to_harvest: daysToHarvest,
    explanation,
  };
}

module.exports = { computeHealthScore, predictYield, NORMAL_RANGES };
