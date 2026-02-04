#!/usr/bin/env node
/**
 * Simple database query script for Claude Code introspection
 * Usage: node scripts/db-query.js "SELECT * FROM table_name LIMIT 5"
 */

require('dotenv').config();
const { Client } = require('pg');

const query = process.argv[2];

if (!query) {
  console.error('Usage: node scripts/db-query.js "YOUR SQL QUERY"');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    const result = await client.query(query);

    if (result.rows.length === 0) {
      console.log('(No rows returned)');
    } else {
      console.table(result.rows);
    }

    await client.end();
  } catch (err) {
    console.error('Query error:', err.message);
    process.exit(1);
  }
}

run();
