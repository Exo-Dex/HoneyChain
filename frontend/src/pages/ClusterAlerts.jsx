import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useRealtimeStream } from '../hooks/useRealtimeStream';

export default function ClusterAlerts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');

  const load = useCallback(async () => {
    try {
      const result = await api.getAlerts();
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeStream(true, () => { load(); });

  async function handleAcknowledge(id) {
    try {
      await api.acknowledgeAlert(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleResolve(id) {
    try {
      await api.resolveAlert(id, 'Resolved by Cluster Admin via real-time console.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading && !data) return <p className="muted">Loading cluster status...</p>;
  if (error && !data) return <div className="error-box">{error}</div>;
  if (!data) return null;

  const { total_hives, counts, flagged, incidents = [] } = data;
  const filteredIncidents = incidents.filter(inc => {
    if (filterSeverity !== 'ALL' && inc.severity !== filterSeverity) return false;
    if (filterStatus !== 'ALL' && inc.status !== filterStatus) return false;
    return true;
  });

  return (
    <div>
      <div className="card">
        <h2>Cluster Alerts &amp; Incident Response Center</h2>
        <p className="muted">
          Real-time cross-apiary anomaly detection and incident response console for KVIC/NBB cluster administrators.
        </p>
        <div className="grid grid-3" style={{ marginTop: 14 }}>
          <SummaryStat label="Total Hives" value={total_hives} />
          <SummaryStat label="Healthy" value={counts.Healthy} />
          <SummaryStat label="Needs Attention" value={counts.Attention + counts.Critical} highlight={counts.Attention + counts.Critical > 0} />
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Real-Time Incident Feed ({filteredIncidents.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ width: 'auto' }} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="WARNING">Warning Only</option>
            </select>
            <select style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>

        {filteredIncidents.length === 0 ? (
          <div className="notice-box" style={{ marginTop: 12 }}>✅ No matching alert incidents for the selected filter.</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {filteredIncidents.map(inc => (
              <div key={inc.id} className="card" style={{ marginBottom: 10, boxShadow: 'none', border: '1px solid #f0e5cc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className={`status-pill status-${inc.severity === 'CRITICAL' ? 'Critical' : 'Attention'}`} style={{ marginRight: 8 }}>
                      {inc.severity}
                    </span>
                    <strong>{inc.title}</strong>
                  </div>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {inc.status} · {new Date(inc.updated_at).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ margin: '8px 0', fontSize: '0.88rem' }}>{inc.message}</p>
                <div className="btn-row" style={{ marginTop: 6 }}>
                  {inc.status === 'ACTIVE' && (
                    <button className="btn-secondary btn" style={{ padding: '5px 10px', fontSize: '0.8rem' }} onClick={() => handleAcknowledge(inc.id)}>
                      Acknowledge
                    </button>
                  )}
                  {inc.status !== 'RESOLVED' && (
                    <button className="btn" style={{ padding: '5px 10px', fontSize: '0.8rem' }} onClick={() => handleResolve(inc.id)}>
                      Resolve Incident
                    </button>
                  )}
                  {inc.hive_id && (
                    <Link to={`/beekeeper/hives/${inc.hive_id}`} className="muted" style={{ alignSelf: 'center', fontSize: '0.82rem' }}>
                      Inspect {inc.hive_id} &rarr;
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Flagged Hives Snapshot {flagged.length > 0 && <span className="muted">({flagged.length})</span>}</h3>
        {flagged.length === 0 ? (
          <div className="notice-box">✅ No hives currently flagged across the cluster.</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {flagged.map(hive => (
              <div key={hive.id} className="card" style={{ marginBottom: 10, boxShadow: 'none', border: '1px solid #f0e5cc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{hive.id}</strong>
                    <span className="muted"> · {hive.beekeeper_name} · {hive.district}, {hive.state} · {hive.apiary_name}</span>
                  </div>
                  <span className={`status-pill status-${hive.health.status}`}>{hive.health.status} ({hive.health.score}/100)</span>
                </div>
                <p style={{ marginTop: 8, fontSize: '0.9rem' }}>{hive.health.reason}</p>
                <Link to={`/beekeeper/hives/${hive.id}`} className="muted" style={{ fontSize: '0.85rem' }}>
                  View live hive telemetry &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, highlight }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: highlight ? 'var(--red-bad)' : 'var(--amber-900)' }}>
        {value}
      </div>
      <div className="muted">{label}</div>
    </div>
  );
}
