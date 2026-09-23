#!/usr/bin/env node
/* Migrate: creates database, applies schema.sql then seed.sql */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const dbName = process.env.DB_NAME || 'hunar';
  console.log(`[migrate] Creating database \`${dbName}\` (if not exists)...`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await conn.query(`USE \`${dbName}\``);

  const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8');
  console.log('[migrate] Applying schema (29 tables)...');
  await conn.query(schema);

  const seedPath = path.join(__dirname, '..', 'src', 'seed.sql');
  if (fs.existsSync(seedPath)) {
    console.log('[migrate] Applying seed data...');
    await conn.query(fs.readFileSync(seedPath, 'utf8'));
  }

  const [tables] = await conn.query('SHOW TABLES');
  console.log(`[migrate] Done. ${tables.length} tables present.`);
  await conn.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
