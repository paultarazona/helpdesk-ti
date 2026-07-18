const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const databaseDirectory = path.join(__dirname, '..', 'src', 'db');

function readDatabaseFile(filename) {
  return fs.readFileSync(path.join(databaseDirectory, filename), 'utf8');
}

test('schema defines helpdesk entities and their relationships', () => {
  const schema = readDatabaseFile('schema.sql');

  for (const table of ['users', 'assets', 'tickets', 'comments', 'ticket_attachments']) {
    assert.match(schema, new RegExp(`CREATE TABLE ${table}`, 'i'));
  }

  assert.match(schema, /requester_id\s+INTEGER\s+NOT NULL\s+REFERENCES users/i);
  assert.match(schema, /asset_id\s+INTEGER\s+REFERENCES assets/i);
  assert.match(schema, /ticket_id\s+INTEGER\s+NOT NULL\s+REFERENCES tickets/i);
});

test('seed creates cross-user data and intentionally plaintext passwords', () => {
  const seed = readDatabaseFile('seed.sql');

  for (const username of ['alice', 'bob', 'dana.agent', 'ada.admin']) {
    assert.match(seed, new RegExp(`'${username}'`));
  }

  assert.match(seed, /\[VULN-010\].*plaintext/i);
  assert.match(seed, /INSERT INTO tickets/i);
  assert.match(seed, /INSERT INTO comments/i);
});
