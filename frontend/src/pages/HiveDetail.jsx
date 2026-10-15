import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useRealtimeStream } from '../hooks/useRealtimeStream';
import { MultiLineTelemetryChart } from '../components/TelemetryCharts';

export default function HiveDetail() {
  const { hiveId } = useParams();
  const { user } = useAuth();
  const [hive, setHive] = useState(null);
  const [metric, setMetric] = useState('temperature');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showHarvest, setShowHarvest] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [floralSource, setFloralSource] = useState('Mustard');
  const [submitting, setSubmitting] = useState(false);
  const [harvestResult, setHarvestResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getHive(hiveId);
      setHive(data);
      if (!quantity && data.yield_prediction?.predicted_kg) {
        setQuantity(String(data.yield_prediction.predicted_kg));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hiveId, quantity]);

  useEffect(() => { load(); }, [load]);
  useRealtimeStream(true, () => { load(); });

  async function handleRecordHarvest(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createHarvest({
        hive_ids: [hiveId],
        quantity_kg: parseFloat(quantity),
        floral_source: floralSource,
      });
      setHarvestResult(result);
      setShowHarvest(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReSimulate(profile) {
    setSimulating(true);
    try {
      await api.simulateHive(hiveId, profile);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  }

  if (loading && !hive) return <p className="muted">Loading live hive stream...</p>;
  if (error && !hive) return <div className="error-box">{error}</div>;
  if (!hive) return null;

  const isBeekeeper = user?.role === 'beekeeper';
  const { health, yield_prediction, readings } = hive;
  const recent = readings.slice(-8).reverse();
  const latest = readings[readings.length - 1];

  return (
    <div>
      <Link to={isBeekeeper ? '/beekeeper' : '/analytics'} className="muted" style={{ textDecoration: 'none' }}>
        &larr; {isBeekeeper ? 'Back to My Apiary' : 'Back to Live Analytics'}
      </Link>

      {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

      {harvestResult && (
        <div className="notice-box" style={{ marginTop: 12 }}>
          <strong>Harvest recorded.</strong> Batch <strong>{harvestResult.batch.batch_code}</strong> created and
          written to the ledger.{' '}
          <Link to="/admin">Continue in Processing / Lab &rarr;</Link>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>{hive.id} — Live Telemetry Inspector</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>{hive.species} · Profile: <strong>{hive.sim_profile || 'healthy'}</strong> · {hive.status}</p>
          </div>
          <span className={`status-pill status-${health.status}`} style={{ fontSize: '0.95rem' }}>
            {health.status} ({health.score}/100)
          </span>
        </div>

        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <StatCard label="Brood Temperature" value={latest ? `${latest.temperature}°C` : '—'} />
          <StatCard label="Relative Humidity" value={latest ? `${latest.humidity}%` : '—'} />
          <StatCard label="Hive Mass" value={latest ? `${latest.weight} kg` : '—'} />
          <StatCard label="Acoustic Buzz" value={latest ? `${Math.round(latest.acoustic_hz ?? 215)} Hz` : '—'} />
          <StatCard label="Foraging Activity" value={latest ? `${latest.foraging_rate ?? 48} /min` : '—'} />
          <StatCard label="Battery / RSSI" value={latest ? `${latest.battery_pct ?? 96}% (${latest.rssi_dbm ?? -68} dBm)` : '—'} />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ margin: 0 }}>Real-Time Sensor Time-Series</label>
            <select style={{ width: 'auto' }} value={metric} onChange={e => setMetric(e.target.value)}>
              <option value="temperature">Temperature (°C)</option>
              <option value="humidity">Humidity (%)</option>
              <option value="weight">Weight (kg)</option>
              <option value="acoustic_hz">Acoustic Frequency (Hz)</option>
            </select>
          </div>
          <MultiLineTelemetryChart readings={readings.slice(-20)} metric={metric} />
        </div>

        <div className="notice-box" style={{ marginTop: 14 }}>
          <strong>AI Health &amp; Yield Insight:</strong> {health.reason} {yield_prediction.explanation}
          <br />
          <strong>Predicted Yield:</strong> {yield_prediction.predicted_kg ?? '—'} kg (Confidence: {yield_prediction.confidence}%)
          {health.flag && <><br /><strong>⚠ {health.flag}</strong></>}
        </div>

        <div className="btn-row" style={{ marginTop: 14 }}>
          {isBeekeeper && (
            <button className="btn" disabled={!user?.beekeeper?.verified} onClick={() => setShowHarvest(s => !s)}>
              {showHarvest ? 'Cancel' : '🍯 Record Harvest'}
            </button>
          )}
          <button className="btn-secondary btn" disabled={simulating} onClick={() => handleReSimulate('healthy')}>Simulate: Healthy</button>
          <button className="btn-secondary btn" disabled={simulating} onClick={() => handleReSimulate('attention')}>Simulate: Attention</button>
          <button className="btn-secondary btn" disabled={simulating} onClick={() => handleReSimulate('critical')}>Simulate: Critical</button>
          <button className="btn-secondary btn" disabled={simulating} onClick={() => handleReSimulate('swarm_risk')}>Simulate: Swarming</button>
        </div>

        {showHarvest && isBeekeeper && (
          <form onSubmit={handleRecordHarvest} style={{ marginTop: 16, maxWidth: 340 }}>
            <div className="field">
              <label>Quantity harvested (kg)</label>
              <input type="number" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
            <div className="field">
              <label>Floral source</label>
              <select value={floralSource} onChange={e => setFloralSource(e.target.value)}>
                <option>Mustard</option>
                <option>Litchi</option>
                <option>Multi-floral</option>
                <option>Eucalyptus</option>
                <option>Wild Jamun</option>
              </select>
            </div>
            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? 'Recording...' : 'Create Batch on Ledger'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 18 }}>
          <label>Recent Sensor Packets (Live Rolling Window)</label>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', marginTop: 6 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                <th style={{ padding: '4px 0' }}>Time</th>
                <th>Temp (°C)</th>
                <th>Humidity (%)</th>
                <th>Weight (kg)</th>
                <th>Acoustic (Hz)</th>
                <th>Foraging</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0e5cc' }}>
                  <td style={{ padding: '4px 0' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td>{r.temperature}</td>
                  <td>{r.humidity}</td>
                  <td>{r.weight}</td>
                  <td>{Math.round(r.acoustic_hz ?? 215)}</td>
                  <td>{r.foraging_rate ?? 48}/min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--amber-100)', borderRadius: 10 }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--amber-900)' }}>{value}</div>
      <div className="muted" style={{ fontSize: '0.76rem' }}>{label}</div>
    </div>
  );
}
