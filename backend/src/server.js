require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const config = require('./config');
const { errorHandler } = require('./middleware/error');
const authRoutes = require('./routes/auth.routes');
const customerRoutes = require('./routes/customer.routes');
const professionalRoutes = require('./routes/professional.routes');
const adminRoutes = require('./routes/admin.routes');
const modulesRoutes = require('./routes/modules.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const { startJobs } = require('./jobs/autoRelease.job');

const app = express();
app.use(compression());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => res.json({ name: 'Hunar API', status: 'ok', version: '1.0.0' }));
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/professional', professionalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads')));

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[hunar] API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  if (config.nodeEnv !== 'test') startJobs();
});
