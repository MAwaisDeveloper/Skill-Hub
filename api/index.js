/**
 * Vercel serverless entry: poora Express API isi function se chalta hai.
 * Path /api/* yahan rewrite hota hai (root vercel.json), req.url = /api/...
 * Env vars (Vercel dashboard): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, CLIENT_URL
 */
const app = require('../backend/src/app');

module.exports = app;
