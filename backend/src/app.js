const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const { errorHandler } = require('./middleware/error');

const authRoutes = require('./routes/auth.routes');
const customerRoutes = require('./routes/customer.routes');
const professionalRoutes = require('./routes/professional.routes');
const adminRoutes = require('./routes/admin.routes');
const modulesRoutes = require('./routes/modules.routes');
const invoiceRoutes = require('./routes/invoice.routes');

const app = express();

app.use(
  cors({
    // Local dev frontend + live Vercel frontend dono allow (comma-separated CLIENT_URL bhi chalega)
    origin: (origin, cb) => {
      const allowed = String(process.env.CLIENT_URL || 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!origin || allowed.includes(origin) || allowed.includes('*')) return cb(null, true);
      return cb(null, false); // CORS block (request without valid origin still reaches API for curl/mobile apps)
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ name: 'Hunar API', status: 'ok', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/professional', professionalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/invoices', invoiceRoutes);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use(errorHandler);

module.exports = app;
