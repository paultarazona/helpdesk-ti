const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { databaseUrl } = require('../src/config');

const databaseDirectory = path.join(__dirname, '..', 'src', 'db');

function readSql(filename) {
  return fs.readFileSync(path.join(databaseDirectory, filename), 'utf8');
}

async function setupDatabase() {
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    const existingUsers = await client.query("SELECT to_regclass('public.users') AS users");

    if (existingUsers.rows[0].users) {
      throw new Error('The database is not empty. Create a new lab database before running db:setup.');
    }

    await client.query('BEGIN');
    await client.query(readSql('schema.sql'));
    await client.query(readSql('seed.sql'));
    await client.query('COMMIT');
    console.log('Database schema and sample data applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  setupDatabase().catch((error) => {
    console.error(`Database setup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { setupDatabase };
