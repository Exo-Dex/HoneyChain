import React from 'react';

/**
 * Pure SVG responsive multi-series line chart with threshold reference bands.
 */
export function MultiLineTelemetryChart({ readings = [], metric = 'temperature', height = 220 }) {
  if (!readings || readings.length < 2) {
    return <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Awaiting telemetry stream...</div>;
  }

  const config = {
    temperature: { label: 'Temperature (°C)', color: '#d97706', min: 26, max: 44, safeMin: 30, safeMax: 36, unit: '°C' },
    humidity: { label: 'Humidity (%)', color: '#0284c7', min: 40, max: 90, safeMin: 50, safeMax: 70, unit: '%' },
    weight: { label: 'Hive Mass (kg)', color: '#16a34a', min: 18, max: 42, safeMin: 26, safeMax: 38, unit: 'kg' },
    acoustic_hz: { label: 'Acoustic Buzz (Hz)', color: '#7c3aed', min: 160, max: 390, safeMin: 190, safeMax: 260, unit: 'Hz' },
  }[metric] || { label: metric, color: '#d97706', min: 0, max: 100, safeMin: 20, safeMax: 80, unit: '' };

  const width = 640;
  const pad = { top: 20, right: 24, bottom: 28, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const vals = readings.map(r => Number(r[metric] ?? 0));
  const minVal = Math.min(config.min, ...vals);
  const maxVal = Math.max(config.max, ...vals);
  const span = Math.max(1, maxVal - minVal);

  const toX = (i) => pad.left + (i / (readings.length - 1)) * plotW;
  const toY = (v) => pad.top + plotH - ((v - minVal) / span) * plotH;

  const points = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const areaPoints = `${toX(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} ${points} ${toX(vals.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)}`;

  const safeTop = toY(config.safeMax);
  const safeBottom = toY(config.safeMin);

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect
          x={pad.left}
          y={Math.max(pad.top, safeTop)}
          width={plotW}
          height={Math.max(0, safeBottom - safeTop)}
          fill="#16a34a"
          fillOpacity="0.09"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
          const y = pad.top + t * plotH;
          const v = (maxVal - t * span).toFixed(0);
          return (
            <g key={idx}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#eee0c0" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#6b5c47">{v}</text>
            </g>
          );
        })}
        <polygon points={areaPoints} fill={config.color} fillOpacity="0.14" />
        <polyline fill="none" stroke={config.color} strokeWidth="2.5" points={points} />
        {vals.map((v, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(v)}
            r={i === vals.length - 1 ? 4.5 : 2.5}
            fill={v > config.safeMax || v < config.safeMin ? '#dc2626' : config.color}
          />
        ))}
      </svg>
    </div>
  );
}

export function Sparkline({ data = [], field = 'temperature', color = '#d97706' }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => Number(d[field] ?? 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(0.5, max - min);
  const w = 120;
  const h = 32;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />
    </svg>
  );
}
