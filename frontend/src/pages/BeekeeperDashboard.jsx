import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { getCurrentBeekeeperId, setCurrentBeekeeperId } from '../lib/currentBeekeeper';

export default function BeekeeperDashboard() {
  const [beekeeperId, setBeekeeperId] = useState(getCurrentBeekeeperId());
  const [beekeeper, setBeekeeper] = useState(null);
  const [allBeekeepers, setAllBeekeepers] = useState([]);
  const [hives, setHives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddHive, setShowAddHive] = useState(false);
  const [newHiveProfile, setNewHiveProfile] = useState('healthy');
  const [creating, setCreating] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ name: '', district: '', state: 'Maharashtra', phone: '' });
  const [registering, setRegistering] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [beekeepers, hivesData] = await Promise.all([
        api.getBeekeepers(),
        api.getHives(beekeeperId),
      ]);
      setAllBeekeepers(beekeepers);
      setBeekeeper(beekeepers.find(b => b.id === beekeeperId) || null);
      setHives(hivesData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [beekeeperId]);

  function handleSwitch(e) {
    const id = e.target.value;
    setCurrentBeekeeperId(id);
    setBeekeeperId(id);
  }

  async function handleAddHive(e) {
    e.preventDefault();
    setCreating(true);
    try {
      // Reuse this beekeeper's apiary, or create one on the fly if they don't have one yet
      const apiaries = await fetch(`/api/beekeepers/${beekeeperId}/apiaries`).then(r => r.json());
      let apiaryId = apiaries[0]?.id;
      if (!apiaryId) {
        const created = await fetch(`/api/beekeepers/${beekeeperId}/apiaries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Main Apiary' }),
        }).then(r => r.json());
        apiaryId = created.id;
      }

      await api.createHive({
        beekeeper_id: beekeeperId,
        apiary_id: apiaryId,
        species: 'Apis cerana',
        simulate_profile: newHiveProfile,
      });
      setShowAddHive(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setRegistering(true);
    setError(null);
    try {
      const newBeekeeper = await api.createBeekeeper(regForm);
      await fetch(`/api/beekeepers/${newBeekeeper.id}/apiaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Main Apiary', location: `${regForm.district}, ${regForm.state}` }),
      });
      setCurrentBeekeeperId(newBeekeeper.id);
      setBeekeeperId(newBeekeeper.id);
      setShowRegister(false);
      setRegForm({ name: '', district: '', state: 'Maharashtra', phone: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setRegistering(false);
    }
  }

  const counts = hives.reduce((acc, h) => {
    acc[h.health_status] = (acc[h.health_status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>My Apiary — {beekeeper?.name || '...'}</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {beekeeper ? `${beekeeper.district || '—'}, ${beekeeper.state || '—'} · ${beekeeper.verified ? 'Verified beekeeper' : 'Unverified'}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={beekeeperId} onChange={handleSwitch} style={{ width: 'auto' }}>
              {allBeekeepers.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button className="btn-secondary btn" onClick={() => setShowRegister(s => !s)}>
              {showRegister ? 'Cancel' : '+ New Beekeeper'}
            </button>
          </div>
        </div>

        {showRegister && (
          <form onSubmit={handleRegister} style={{ marginTop: 16, maxWidth: 360, borderTop: '1px solid #f0e5cc', paddingTop: 16 }}>
            <div className="field">
              <label>Full name</label>
              <input required value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>District</label>
                <input required value={regForm.district} onChange={e => setRegForm({ ...regForm, district: e.target.value })} />
              </div>
              <div className="field">
                <label>State</label>
                <input required value={regForm.state} onChange={e => setRegForm({ ...regForm, state: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={regForm.phone} onChange={e => setRegForm({ ...regForm, phone: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={registering}>
              {registering ? 'Registering...' : 'Register & Switch'}
            </button>
          </form>
        )}

        <div className="grid grid-3" style={{ marginTop: 14 }}>
          <SummaryStat label="Total Hives" value={hives.length} />
          <SummaryStat label="Healthy / Attention" value={`${counts.Healthy || 0} / ${counts.Attention || 0}`} />
          <SummaryStat label="Critical" value={counts.Critical || 0} highlight={counts.Critical > 0} />
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Hives</h3>
          <button className="btn" onClick={() => setShowAddHive(s => !s)}>
            {showAddHive ? 'Cancel' : '+ Register Hive'}
          </button>
        </div>

        {showAddHive && (
          <form onSubmit={handleAddHive} style={{ marginTop: 16, maxWidth: 320 }}>
            <div className="field">
              <label>Simulated sensor profile (demo only)</label>
              <select value={newHiveProfile} onChange={e => setNewHiveProfile(e.target.value)}>
                <option value="healthy">Healthy</option>
                <option value="attention">Attention</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <button className="btn" type="submit" disabled={creating}>
              {creating ? 'Registering...' : 'Register Hive'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="muted">Loading hives...</p>
        ) : hives.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>No hives yet for this beekeeper. Register one above.</p>
        ) : (
          <div className="grid grid-3" style={{ marginTop: 16 }}>
            {hives.map(hive => (
              <Link to={`/beekeeper/hives/${hive.id}`} key={hive.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="hive-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <strong>{hive.id}</strong>
                    <span className={`status-pill status-${hive.health_status}`}>{hive.health_status}</span>
                  </div>
                  <p className="muted" style={{ margin: '8px 0 0' }}>{hive.species}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                    Health score: <strong>{hive.health_score ?? '—'}</strong>/100
                  </p>
                </div>
              </Link>
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
