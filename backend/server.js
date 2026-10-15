require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./db/db'); // ensures schema is applied on boot

const authRoute = require('./routes/auth');
const adminRoute = require('./routes/admin');
const hivesRoute = require('./routes/hives');
const harvestsRoute = require('./routes/harvests');
const batchesRoute = require('./routes/batches');
const qualityRoute = require('./routes/quality');
const { router: productsRoute, publicRouter: verifyRoute } = require('./routes/products');
const alertsRoute = require('./routes/alerts');
const ledgerRoute = require('./routes/ledger');
const analyticsRoute = require('./routes/analytics');
const streamRoute = require('./routes/stream');
const iotRoute = require('./routes/iot');
const { router: certificateRoute, publicRouter: certificatePublicRoute } = require('./routes/certificate');
const { liveSimulator } = require('./services/simulator');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'honey-chain-backend',
  simulation: liveSimulator.getState(),
}));

app.use('/api/auth', authRoute);
app.use('/api/admin', adminRoute);
app.use('/api/hives', hivesRoute);
app.use('/api/harvests', harvestsRoute);
app.use('/api/batches', batchesRoute);
app.use('/api/batches', qualityRoute);
app.use('/api/batches', productsRoute);
app.use('/api/batches', certificateRoute);
app.use('/api', verifyRoute);
app.use('/api', certificatePublicRoute);
app.use('/api/alerts', alertsRoute);
app.use('/api/ledger', ledgerRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/stream', streamRoute);
app.use('/api/iot', iotRoute);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  if (liveSimulator.mode !== 'ESP32_LIVE') {
    liveSimulator.start(3000);
  }
  app.listen(PORT, () => {
    console.log(`Honey Chain Real-Time backend running on http://localhost:${PORT} (Mode: ${liveSimulator.mode})`);
  });
}

module.exports = app;
