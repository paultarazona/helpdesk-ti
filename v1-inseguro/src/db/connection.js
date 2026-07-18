const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl });

async function closePool() {
  await pool.end();
}

module.exports = { pool, closePool };
