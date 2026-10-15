import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useRealtimeStream } from '../hooks/useRealtimeStream';
import { MultiLineTelemetryChart, Sparkline } from '../components/TelemetryCharts';

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [iotStatus, setIotStatus] = useState(null);
  const [selectedHiveId, setSelectedHiveId] = useState('H-001');
  const [selectedMetric, setSelectedMetric] = useState('temperature');
  const [showEsp32Panel, setShowEsp32Panel] = useState(false);
  const [esp32Form, setEsp32Form] = useState({ hive_id: 'H-001', device_id: 'ESP32-PUNE-NODE01', temperature: 34.1, humidity: 60.5, weight: 33.4, acoustic_hz: 218, foraging_rate: 62 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAnalytics = useCallback(async () => {
    try {
      const [data, iot] = await Promise.all([api.getAnalytics(), api.getIotStatus()]);
      setAnalytics(data);
      setIotStatus(iot);
      if (data.hives_matrix?.length > 0 && !data.hives_matrix.some(h => h.id === selectedHiveId)) {
        setSelectedHiveId(data.hives_matrix[0].id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedHiveId]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const { simState, connected, control } = useRealtimeStream(true, () => {
    loadAnalytics();
  });

  async function handleModeSwitch(newMode) {
    try {
      await api.setIotMode({ mode: newMode });
      await loadAnalytics();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSendEsp32Packet(e) {
    e.preventDefault();
    try {
      await api.ingestEsp32Packet({
        ...esp32Form,
        temperature: parseFloat(esp32Form.temperature),
        humidity: parseFloat(esp32Form.humidity),
        weight: parseFloat(esp32Form.weight),
        acoustic_hz: parseFloat(esp32Form.acoustic_hz),
        foraging_rate: parseInt(esp32Form.foraging_rate, 10),
      });
      await loadAnalytics();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleInjectScenario(hiveId, profile) {
    try {
      await api.simulateHive(hiveId, profile);
      await loadAnalytics();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading && !analytics) return <p className="muted">Loading real-time telemetry command center...</p>;
  if (error && !analytics) return <div className="error-box">{error}</div>;
  if (!analytics) return null;

  const { kpis, health_distribution, batch_pipeline, floral_breakdown_kg, hives_matrix, active_alerts } = analytics;
  const activeHive = hives_matrix.find(h => h.id === selectedHiveId) || hives_matrix[0];
  const currentMode = iotStatus?.state?.mode || simState.mode || 'SIMULATION';

  return (
    <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Real-Time Telemetry &amp; Supply Chain Analytics</h2>
            <span className={`status-pill ${currentMode === 'ESP32_LIVE' ? 'status-Attention' : 'status-Healthy'}`}>
              {currentMode === 'ESP32_LIVE' ? '📡 ESP32 HARDWARE MODE' : (currentMode === 'HYBRID' ? '🔀 HYBRID (ESP32 + SIM)' : '🤖 SIMULATION STREAM')}
              {' '}· Tick #{simState.tick_count}
            </span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Switch seamlessly between simulated IoT telemetry and physical ESP32 sensor nodes (<code>POST /api/iot/ingest</code>).
          </p>
        </div>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <select
            style={{ width: 'auto', fontWeight: 700 }}
            value={currentMode}
            onChange={(e) => handleModeSwitch(e.target.value)}
          >
            <option value="SIMULATION">Source: 🤖 Simulation Mode</option>
            <option value="ESP32_LIVE">Source: 📡 ESP32 Live Hardware Only</option>
            <option value="HYBRID">Source: 🔀 Hybrid (ESP32 + Sim Fallback)</option>
          </select>

          <button className="btn-secondary btn" onClick={() => setShowEsp32Panel(s => !s)}>
            📡 {showEsp32Panel ? 'Hide ESP32 Setup' : 'ESP32 Hardware & Test'}
          </button>

          {currentMode !== 'ESP32_LIVE' && (
            <>
              <button className="btn" onClick={() => control(simState.running ? 'pause' : 'start')}>
                {simState.running ? '⏸ Pause' : '▶ Resume'}
              </button>
              <button className="btn-secondary btn" onClick={() => control('step')}>
                +1 Tick
              </button>
            </>
          )}
        </div>
      </div>

      {showEsp32Panel && (
        <div className="card" style={{ border: '2px solid var(--amber-500)' }}>
          <h3 style={{ marginTop: 0 }}>📡 Physical ESP32 Node Connection &amp; Live Packet Tester</h3>
          <p className="muted">
            Point your ESP32 firmware (<code>firmware/esp32_honeychain_node/esp32_honeychain_node.ino</code>) or USB Serial bridge (<code>firmware/serial_bridge.py</code>) to <code>POST http://localhost:4000/api/iot/ingest</code> with header <code>X-ESP32-API-Key: {iotStatus?.demo_api_key || 'hc-esp32-demo-key-2026'}</code>.
          </p>
          <form onSubmit={handleSendEsp32Packet} className="grid grid-3" style={{ alignItems: 'end', marginTop: 12 }}>
            <div>
              <label>Hive ID</label>
              <select value={esp32Form.hive_id} onChange={e => setEsp32Form({ ...esp32Form, hive_id: e.target.value })}>
                {hives_matrix.map(h => <option key={h.id} value={h.id}>{h.id}</option>)}
              </select>
            </div>
            <div>
              <label>ESP32 Device ID</label>
              <input value={esp32Form.device_id} onChange={e => setEsp32Form({ ...esp32Form, device_id: e.target.value })} />
            </div>
            <div>
              <label>Temp (°C) / Humidity (%)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" step="0.1" value={esp32Form.temperature} onChange={e => setEsp32Form({ ...esp32Form, temperature: e.target.value })} />
                <input type="number" step="0.1" value={esp32Form.humidity} onChange={e => setEsp32Form({ ...esp32Form, humidity: e.target.value })} />
              </div>
            </div>
            <div>
              <label>Weight (kg) / Acoustic (Hz)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" step="0.1" value={esp32Form.weight} onChange={e => setEsp32Form({ ...esp32Form, weight: e.target.value })} />
                <input type="number" step="1" value={esp32Form.acoustic_hz} onChange={e => setEsp32Form({ ...esp32Form, acoustic_hz: e.target.value })} />
              </div>
            </div>
            <div>
              <label>Foraging (bees/min)</label>
              <input type="number" value={esp32Form.foraging_rate} onChange={e => setEsp32Form({ ...esp32Form, foraging_rate: e.target.value })} />
            </div>
            <div>
              <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
                📡 Push ESP32 Hardware Packet
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <KpiCard label="Fleet Health Score" value={`${kpis.avg_health_score}/100`} sub={`${health_distribution.Healthy || 0} Healthy · ${health_distribution.Critical || 0} Critical`} />
        <KpiCard label="Predicted Cluster Yield" value={`${kpis.total_predicted_yield_kg} kg`} sub={`Avg Temp ${kpis.avg_temperature_c}°C · Hum ${kpis.avg_humidity_pct}%`} />
        <KpiCard label="Active Alerts & Ledger" value={`${kpis.active_alerts_count} Alerts`} sub={`${kpis.ledger_events_count} SHA-256 Events (${kpis.ledger_valid ? 'Verified' : 'Broken'})`} highlight={kpis.active_alerts_count > 0} />
      </div>

      {activeHive && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>Live Hive Telemetry Stream — {activeHive.id} ({activeHive.species})</h3>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                Source: <strong>{activeHive.latest_reading?.source || 'SIMULATION'}</strong> · Health: <strong>{activeHive.health.score}/100 ({activeHive.health.status})</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ width: 'auto' }} value={selectedHiveId} onChange={e => setSelectedHiveId(e.target.value)}>
                {hives_matrix.map(h => (
                  <option key={h.id} value={h.id}>{h.id} — {h.health.status} ({h.health.score})</option>
                ))}
              </select>
              <select style={{ width: 'auto' }} value={selectedMetric} onChange={e => setSelectedMetric(e.target.value)}>
                <option value="temperature">Temperature (°C)</option>
                <option value="humidity">Humidity (%)</option>
                <option value="weight">Hive Weight (kg)</option>
                <option value="acoustic_hz">Acoustic Frequency (Hz)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <MultiLineTelemetryChart readings={activeHive.recent_readings} metric={selectedMetric} />
          </div>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <span className="muted" style={{ alignSelf: 'center', fontWeight: 600 }}>Inject Demo Scenario on {activeHive.id}:</span>
            <button className="btn-secondary btn" onClick={() => handleInjectScenario(activeHive.id, 'healthy')}>Healthy Flow</button>
            <button className="btn-secondary btn" onClick={() => handleInjectScenario(activeHive.id, 'attention')}>Heat / Humidity Drift</button>
            <button className="btn-secondary btn" onClick={() => handleInjectScenario(activeHive.id, 'critical')}>Critical Overheat</button>
            <button className="btn-secondary btn" onClick={() => handleInjectScenario(activeHive.id, 'swarm_risk')}>Swarming / Weight Drop</button>
            <button className="btn-secondary btn" onClick={() => handleInjectScenario(activeHive.id, 'fermentation_risk')}>High Moisture Risk</button>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Hive Fleet Matrix</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                <th>Hive</th>
                <th>Source</th>
                <th>Temp / Hum</th>
                <th>Weight</th>
                <th>Trend</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {hives_matrix.map(h => (
                <tr key={h.id} style={{ borderTop: '1px solid #f0e5cc', cursor: 'pointer' }} onClick={() => setSelectedHiveId(h.id)}>
                  <td style={{ padding: '6px 0' }}>
                    <Link to={`/beekeeper/hives/${h.id}`} style={{ fontWeight: 700, color: 'var(--amber-900)' }}>{h.id}</Link>
                  </td>
                  <td><span className="muted" style={{ fontSize: '0.75rem' }}>{h.latest_reading?.source || 'SIM'}</span></td>
                  <td>{h.latest_reading?.temperature}°C / {h.latest_reading?.humidity}%</td>
                  <td>{h.latest_reading?.weight} kg</td>
                  <td><Sparkline data={h.recent_readings} field="temperature" /></td>
                  <td><span className={`status-pill status-${h.health.status}`}>{h.health.score}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Supply Chain Pipeline &amp; Floral Yield</h3>
          <div className="grid grid-3" style={{ marginBottom: 14 }}>
            {Object.entries(batch_pipeline).map(([status, count]) => (
              <div key={status} style={{ padding: 8, background: 'var(--amber-100)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{count}</div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{status}</div>
              </div>
            ))}
          </div>
          <h4>Harvested Volume by Floral Source</h4>
          {Object.keys(floral_breakdown_kg).length === 0 ? (
            <p className="muted">No harvests recorded yet.</p>
          ) : (
            Object.entries(floral_breakdown_kg).map(([source, kg]) => (
              <div key={source} className="stat-row">
                <span className="stat-label">{source}</span>
                <span className="stat-value">{kg} kg</span>
              </div>
            ))
          )}
          <h4 style={{ marginTop: 16 }}>Recent Active Alerts ({active_alerts.length})</h4>
          {active_alerts.slice(0, 4).map(a => (
            <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee0c0', fontSize: '0.84rem' }}>
              <span className={`status-pill status-${a.severity === 'CRITICAL' ? 'Critical' : 'Attention'}`} style={{ marginRight: 6 }}>
                {a.severity}
              </span>
              <strong>{a.title}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, highlight }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: highlight ? 'var(--red-bad)' : 'var(--amber-900)', margin: '4px 0' }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: '0.78rem' }}>{sub}</div>
    </div>
  );
}
