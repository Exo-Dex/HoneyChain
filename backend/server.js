const express = require('express');
const cors = require('cors');

require('./db/db'); // ensures schema is applied on boot

const beekeepersRoute = require('./routes/beekeepers');
const hivesRoute = require('./routes/hives');
const harvestsRoute = require('./routes/harvests');
const batchesRoute = require('./routes/batches');
const qualityRoute = require('./routes/quality');
const { router: productsRoute, publicRouter: verifyRoute } = require('./routes/products');
const alertsRoute = require('./routes/alerts');
const ledgerRoute = require('./routes/ledger');
const { router: certificateRoute, publicRouter: certificatePublicRoute } = require('./routes/certificate');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'honey-chain-backend' }));

app.use('/api/beekeepers', beekeepersRoute);
app.use('/api/hives', hivesRoute);
app.use('/api/harvests', harvestsRoute);
app.use('/api/batches', batchesRoute);
app.use('/api/batches', qualityRoute);   // adds POST /:batchId/quality-test under /api/batches
app.use('/api/batches', productsRoute);  // adds POST /:batchId/activate-qr under /api/batches
app.use('/api/batches', certificateRoute); // adds GET /:id/certificate under /api/batches
app.use('/api', verifyRoute);            // exposes GET /api/verify/:qrToken (public)
app.use('/api', certificatePublicRoute); // exposes GET /api/verify/:qrToken/certificate (public)
app.use('/api/alerts', alertsRoute);
app.use('/api/ledger', ledgerRoute);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Honey Chain backend running on http://localhost:${PORT}`);
});
