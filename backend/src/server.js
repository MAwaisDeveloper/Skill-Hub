require('dotenv').config();

// Pure Express app (serverless-safe, koi listen nahi yahan)
const app = require('./app');

// Local cron only for long-running server (Vercel serverless par nahi chalta)
let startJobs = null;
try {
  startJobs = require('./jobs/autoRelease.job').startJobs;
} catch (_) { /* jobs optional */ }

const config = require('./config');
const { pool } = require('./config/db');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`[server] Hunar API listening on http://localhost:${PORT}`);
  if (config.nodeEnv !== 'test' && typeof startJobs === 'function') {
    try {
      startJobs();
    } catch (err) {
      console.error('[server] failed to start cron jobs:', err.message);
    }
  }
});

// Graceful shutdown (local dev + Ctrl+C)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[server] ${sig} received, shutting down...`);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
