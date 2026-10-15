const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // Admin
  getPendingBeekeepers: () => request('/admin/beekeepers?status=pending'),
  getAllBeekeepers: () => request('/admin/beekeepers?status=all'),
  verifyBeekeeper: (beekeeperId) => request(`/admin/beekeepers/${beekeeperId}/verify`, { method: 'POST' }),

  // Hives
  getHives: () => request('/hives'),
  getHive: (id) => request(`/hives/${id}`),
  createHive: (body) => request('/hives', { method: 'POST', body: JSON.stringify(body) }),
  simulateHive: (id, profile) => request(`/hives/${id}/simulate`, { method: 'POST', body: JSON.stringify({ profile }) }),
  postHiveReading: (id, body) => request(`/hives/${id}/readings`, { method: 'POST', body: JSON.stringify(body) }),

  // Real-time stream, IoT hardware mode & analytics
  getAnalytics: () => request('/analytics'),
  controlStream: (body) => request('/stream/control', { method: 'POST', body: JSON.stringify(body) }),
  getIotStatus: () => request('/iot/status'),
  setIotMode: (body) => request('/iot/mode', { method: 'POST', body: JSON.stringify(body) }),
  ingestEsp32Packet: (body) => request('/iot/ingest', { method: 'POST', body: JSON.stringify(body) }),

  // Harvests / Batches
  createHarvest: (body) => request('/harvests', { method: 'POST', body: JSON.stringify(body) }),
  getHarvests: () => request('/harvests'),
  getBatches: () => request('/batches'),
  getBatch: (id) => request(`/batches/${id}`),
  advanceBatch: (id, event_type, note) =>
    request(`/batches/${id}/advance`, { method: 'POST', body: JSON.stringify({ event_type, note }) }),
  qualityTest: (batchId, body) =>
    request(`/batches/${batchId}/quality-test`, { method: 'POST', body: JSON.stringify(body || {}) }),
  activateQr: (batchId) =>
    request(`/batches/${batchId}/activate-qr`, { method: 'POST', body: JSON.stringify({}) }),
  verifyBatchIntegrity: (id) => request(`/batches/${id}/verify`),

  // Consumer
  verifyProduct: (qrToken) => request(`/verify/${qrToken}`),

  // Alerts / Ledger explorer
  getAlerts: () => request('/alerts'),
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  resolveAlert: (id, note) => request(`/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),
  updateAlertThresholds: (thresholds) => request('/alerts/thresholds', { method: 'PUT', body: JSON.stringify(thresholds) }),
  getLedger: (limit = 100) => request(`/ledger?limit=${limit}`),
};
