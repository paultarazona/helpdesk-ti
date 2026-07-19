const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectDirectory = path.join(__dirname, '..');

test('students have a PostgreSQL bootstrap command and setup guide', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'));
  const setupScriptPath = path.join(projectDirectory, 'scripts', 'setup-db.js');
  const readmePath = path.join(projectDirectory, 'README.md');
  const envExamplePath = path.join(projectDirectory, '.env.example');

  assert.equal(packageJson.scripts['db:setup'], 'node scripts/setup-db.js');
  assert.ok(fs.existsSync(setupScriptPath));
  assert.ok(fs.existsSync(readmePath));
  assert.ok(fs.existsSync(envExamplePath));

  const setupScript = fs.readFileSync(setupScriptPath, 'utf8');
  assert.match(setupScript, /schema\.sql/);
  assert.match(setupScript, /seed\.sql/);
  assert.match(setupScript, /BEGIN/);
  assert.match(setupScript, /COMMIT/);
  assert.match(setupScript, /ROLLBACK/);

  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.match(readme, /npm install/);
  assert.match(readme, /npm run db:setup/);
  assert.match(readme, /npm start/);
  assert.match(readme, /npm test/);
  assert.match(readme, /PostgreSQL/);
});

test('database setup applies schema and seed in one transaction', async () => {
  const { Client } = require('pg');
  const { setupDatabase } = require('../scripts/setup-db');
  const originalConnect = Client.prototype.connect;
  const originalQuery = Client.prototype.query;
  const originalEnd = Client.prototype.end;
  const originalLog = console.log;
  const queries = [];

  Client.prototype.connect = async () => {};
  Client.prototype.query = async (sql) => {
    queries.push(sql);

    if (sql.includes('to_regclass')) {
      return { rows: [{ users: null }] };
    }

    return { rows: [] };
  };
  Client.prototype.end = async () => {};
  console.log = () => {};

  try {
    await setupDatabase();
  } finally {
    Client.prototype.connect = originalConnect;
    Client.prototype.query = originalQuery;
    Client.prototype.end = originalEnd;
    console.log = originalLog;
  }

  assert.equal(queries[1], 'BEGIN');
  assert.match(queries[2], /CREATE TABLE users/i);
  assert.match(queries[3], /INSERT INTO users/i);
  assert.equal(queries[4], 'COMMIT');
});
