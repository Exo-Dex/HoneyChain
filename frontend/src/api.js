const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  // Beekeepers
  getBeekeepers: () => request('/beekeepers'),
  createBeekeeper: (body) => request('/beekeepers', { method: 'POST', body: JSON.stringify(body) }),

  // Hives
  getHives: (beekeeperId) => request(`/hives?beekeeper_id=${beekeeperId}`),
  getHive: (id) => request(`/hives/${id}`),
  createHive: (body) => request('/hives', { method: 'POST', body: JSON.stringify(body) }),
  simulateHive: (id, profile) => request(`/hives/${id}/simulate`, { method: 'POST', body: JSON.stringify({ profile }) }),

  // Harvests / Batches
  createHarvest: (body) => request('/harvests', { method: 'POST', body: JSON.stringify(body) }),
  getHarvests: (beekeeperId) => request(`/harvests?beekeeper_id=${beekeeperId}`),
  getBatches: () => request('/batches'),
  getBatch: (id) => request(`/batches/${id}`),
  advanceBatch: (id, event_type, actor, note) =>
    request(`/batches/${id}/advance`, { method: 'POST', body: JSON.stringify({ event_type, actor, note }) }),
  qualityTest: (batchId, body) =>
    request(`/batches/${batchId}/quality-test`, { method: 'POST', body: JSON.stringify(body || {}) }),
  activateQr: (batchId) =>
    request(`/batches/${batchId}/activate-qr`, { method: 'POST', body: JSON.stringify({}) }),
  verifyBatchIntegrity: (id) => request(`/batches/${id}/verify`),

  // Consumer
  verifyProduct: (qrToken) => request(`/verify/${qrToken}`),

  // Alerts / Ledger explorer
  getAlerts: () => request('/alerts'),
  getLedger: (limit = 100) => request(`/ledger?limit=${limit}`),
};
