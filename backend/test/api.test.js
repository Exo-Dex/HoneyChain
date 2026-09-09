const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DB = path.join(__dirname, 'tmp-api.db');
process.env.HONEYCHAIN_DB_PATH = TEST_DB;
cleanupDbFiles();

const app = require('../server');
const db = require('../db/db');

function cleanupDbFiles() {
  for (const ext of ['', '-shm', '-wal']) {
    const p = TEST_DB + ext;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
      // Windows can briefly hold a lock on the file even right after close();
      // this is just temp test data, so don't fail the suite over cleanup.
      console.warn(`Warning: could not remove ${p}: ${err.message}`);
    }
  }
}

let server;
let baseUrl;

test.before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  db.exec(`INSERT INTO beekeepers (id, name, district, state, verified) VALUES ('BK-API','API Tester','Pune','Maharashtra',1)`);
  db.exec(`INSERT INTO apiaries (id, beekeeper_id) VALUES ('AP-API','BK-API')`);
  db.exec(`INSERT INTO hives (id, apiary_id, beekeeper_id, status) VALUES ('H-API-1','AP-API','BK-API','ACTIVE')`);
  db.exec(`INSERT INTO hives (id, apiary_id, beekeeper_id, status) VALUES ('H-API-2','AP-API','BK-API','ACTIVE')`);
});

test.after(() => {
  server.close();
  // Windows locks the file while the connection is open - close it first so
  // the unlink below doesn't fail with EBUSY (harmless on Linux/macOS either way).
  try { db.close(); } catch { /* already closed or never opened */ }
  cleanupDbFiles();
});

async function postJson(urlPath, body) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('rejects a harvest referencing a hive that does not exist', async () => {
  const { status, data } = await postJson('/api/harvests', {
    hive_ids: ['H-DOES-NOT-EXIST'],
    beekeeper_id: 'BK-API',
    quantity_kg: 5,
  });
  assert.strictEqual(status, 400);
  assert.match(data.error, /Unknown hive_ids/);
});

test('rejects a harvest for a beekeeper that does not exist', async () => {
  const { status, data } = await postJson('/api/harvests', {
    hive_ids: ['H-API-1'],
    beekeeper_id: 'BK-DOES-NOT-EXIST',
    quantity_kg: 5,
  });
  assert.strictEqual(status, 400);
  assert.match(data.error, /Unknown beekeeper_id/);
});

let quarantineBatchId;

test('creates a harvest and batch for a valid hive', async () => {
  const { status, data } = await postJson('/api/harvests', {
    hive_ids: ['H-API-1'],
    beekeeper_id: 'BK-API',
    quantity_kg: 5,
    floral_source: 'Mustard',
  });
  assert.strictEqual(status, 201);
  assert.ok(data.batch.id);
  assert.strictEqual(data.batch.status, 'CREATED');
  quarantineBatchId = data.batch.id;
});

test('rejects quality-test before the batch has been received (out-of-order)', async () => {
  const { status, data } = await postJson(`/api/batches/${quarantineBatchId}/quality-test`, {});
  assert.strictEqual(status, 400);
  assert.match(data.error, /must be 'RECEIVED'/);
});

test('rejects marking processed before the batch has been received/tested (out-of-order)', async () => {
  const { status, data } = await postJson(`/api/batches/${quarantineBatchId}/advance`, { event_type: 'BATCH_PROCESSED' });
  assert.strictEqual(status, 400);
});

test('a failed quality test quarantines the batch and blocks further progress', async () => {
  let res = await postJson(`/api/batches/${quarantineBatchId}/advance`, { event_type: 'BATCH_RECEIVED' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.new_status, 'RECEIVED');

  res = await postJson(`/api/batches/${quarantineBatchId}/quality-test`, { moisture: 24, hmf: 95, c4_sugar: 9 });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.new_status, 'QUARANTINED');

  res = await postJson(`/api/batches/${quarantineBatchId}/advance`, { event_type: 'BATCH_PROCESSED' });
  assert.strictEqual(res.status, 400);
  assert.match(res.data.error, /quarantined/i);

  res = await postJson(`/api/batches/${quarantineBatchId}/activate-qr`, {});
  assert.strictEqual(res.status, 400);
  assert.match(res.data.error, /quarantined/i);
});

let happyBatchId;

test('full happy path: received -> tested (pass) -> processed -> packaged', async () => {
  let res = await postJson('/api/harvests', {
    hive_ids: ['H-API-2'],
    beekeeper_id: 'BK-API',
    quantity_kg: 6,
    floral_source: 'Litchi',
  });
  assert.strictEqual(res.status, 201);
  happyBatchId = res.data.batch.id;

  res = await postJson(`/api/batches/${happyBatchId}/advance`, { event_type: 'BATCH_RECEIVED' });
  assert.strictEqual(res.status, 200);

  res = await postJson(`/api/batches/${happyBatchId}/quality-test`, { moisture: 17, hmf: 20, c4_sugar: 2 });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.new_status, 'TESTED');

  res = await postJson(`/api/batches/${happyBatchId}/advance`, { event_type: 'BATCH_PROCESSED' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.new_status, 'PROCESSED');

  res = await postJson(`/api/batches/${happyBatchId}/activate-qr`, {});
  assert.strictEqual(res.status, 201);
  assert.ok(res.data.product.qr_token);
});

test('the whole ledger is still internally consistent after all of the above', async () => {
  const res = await fetch(`${baseUrl}/api/ledger`);
  const data = await res.json();
  assert.strictEqual(data.integrity.valid, true);
});
