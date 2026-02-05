#!/usr/bin/env node
/**
 * Execute DDL statements (CREATE FUNCTION, etc.) that don't return rows
 * Usage: node scripts/db-exec.js path/to/file.sql
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const sqlFile = process.argv[2];

if (!sqlFile) {
  console.error('Usage: node scripts/db-exec.js path/to/file.sql');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(sqlFile), 'utf-8');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    await client.query(sql);
    console.log('SQL executed successfully');
    await client.end();
  } catch (err) {
    console.error('Query error:', err.message);
    process.exit(1);
  }
}

run();
