require('dotenv').config();
const { pool } = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function main() {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'src', 'seed.sql'), 'utf8');
  await pool.query(seed);
  console.log('[seed] Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
