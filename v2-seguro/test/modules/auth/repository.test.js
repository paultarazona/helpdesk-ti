const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { env } = require('../../../src/config/env');

// Integration tests against a real Postgres instance (NODE_ENV=test),
// per the plan's explicit requirement to test the repository layer against
// real Postgres rather than mocks — this is the layer that must prove it
// never string-concatenates SQL (mitigates VULN-001).
//
// If no reachable Postgres test database exists in this environment, these
// tests are skipped with a clear message rather than faked as passing.

function checkPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const cleanup = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => cleanup(true));
    socket.once('timeout', () => cleanup(false));
    socket.once('error', () => cleanup(false));
  });
}

describe('AuthRepository (integration, real Postgres)', () => {
  let dbAvailable = false;
  let db;
  let closeConnection;
  let AuthRepository;
  let repository;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[repository.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping AuthRepository integration tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    ({ db, closeConnection } = require('../../../src/db/connection'));
    ({ AuthRepository } = require('../../../src/modules/auth/repository'));
    repository = new AuthRepository(db);

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[repository.test.js] Could not run migrations against the test DB: ${error.message}`);
      dbAvailable = false;
    }
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('users').where({ username: 'repo_test_user' }).del();
      await closeConnection();
    }
  });

  test('create() persists a user and returns it without leaking password_hash', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const created = await repository.create({
      username: 'repo_test_user',
      email: 'repo_test_user@example.com',
      passwordHash: 'bcrypt-hash-placeholder',
      role: 'user',
    });

    assert.equal(created.username, 'repo_test_user');
    assert.equal(created.email, 'repo_test_user@example.com');
    assert.equal(created.role, 'user');
    assert.equal(created.password_hash, undefined);
    assert.equal(created.passwordHash, undefined);
  });

  test('findByUsername() returns the raw row including password_hash for the service to verify', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findByUsername('repo_test_user');

    assert.ok(found);
    assert.equal(found.username, 'repo_test_user');
    assert.equal(found.password_hash, 'bcrypt-hash-placeholder');
  });

  test('findByUsername() returns null for a username that does not exist', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findByUsername('definitely_not_a_user');
    assert.equal(found, null);
  });

  test('findByUsername() treats a classic SQLi payload as an ordinary literal value, not SQL', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findByUsername("' OR '1'='1");
    assert.equal(found, null);
  });

  test('findByEmail() finds the created user by email', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findByEmail('repo_test_user@example.com');
    assert.ok(found);
    assert.equal(found.username, 'repo_test_user');
  });
});
