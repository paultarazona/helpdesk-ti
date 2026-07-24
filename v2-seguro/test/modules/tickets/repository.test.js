const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { env } = require('../../../src/config/env');

// Integration tests against a real Postgres instance, same pattern as
// test/modules/auth/repository.test.js. Skips (t.skip()) rather than
// fake-passing when no reachable test database exists.

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

describe('TicketsRepository (integration, real Postgres)', () => {
  let dbAvailable = false;
  let db;
  let closeConnection;
  let TicketsRepository;
  let repository;
  let requesterId;
  let otherUserId;
  let assetId;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[tickets/repository.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping TicketsRepository integration tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    ({ db, closeConnection } = require('../../../src/db/connection'));
    ({ TicketsRepository } = require('../../../src/modules/tickets/repository'));
    repository = new TicketsRepository(db);

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[tickets/repository.test.js] Could not run migrations against the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('tickets').where({ subject: 'repo_test_ticket' }).del();
    await db('users').where({ username: 'repo_test_ticket_owner' }).del();
    await db('assets').where({ name: 'repo_test_asset' }).del();

    [{ id: requesterId }] = await db('users')
      .insert({
        username: 'repo_test_ticket_owner',
        email: 'repo_test_ticket_owner@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');

    [{ id: otherUserId }] = await db('users')
      .insert({
        username: 'repo_test_ticket_other',
        email: 'repo_test_ticket_other@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');

    [{ id: assetId }] = await db('assets')
      .insert({ name: 'repo_test_asset', asset_type: 'laptop' })
      .returning('id');
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('tickets').where({ requester_id: requesterId }).del();
      await db('users').whereIn('username', ['repo_test_ticket_owner', 'repo_test_ticket_other']).del();
      await db('assets').where({ name: 'repo_test_asset' }).del();
      await closeConnection();
    }
  });

  test('create() + findById() persists a ticket and returns it joined with requester/asset', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      subject: 'repo_test_ticket',
      description: 'Integration test ticket.',
      priority: 'high',
      status: 'open',
      requesterId,
      assetId,
    });

    const found = await repository.findById(id);

    assert.ok(found);
    assert.equal(found.subject, 'repo_test_ticket');
    assert.equal(found.priority, 'high');
    assert.equal(found.requester_username, 'repo_test_ticket_owner');
    assert.equal(found.asset_name, 'repo_test_asset');
  });

  test('findById() returns null for a ticket that does not exist', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findById(999999999);
    assert.equal(found, null);
  });

  test('update() changes only the provided fields and bumps updated_at', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      subject: 'repo_test_ticket',
      description: 'Before update.',
      priority: 'low',
      status: 'open',
      requesterId,
    });

    const updated = await repository.update(id, { status: 'closed' });

    assert.equal(updated.status, 'closed');
    assert.equal(updated.description, 'Before update.');
    assert.equal(updated.priority, 'low');
  });

  test('delete() removes the ticket', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      subject: 'repo_test_ticket',
      description: 'To be deleted.',
      priority: 'medium',
      status: 'open',
      requesterId,
    });

    await repository.delete(id);
    const found = await repository.findById(id);
    assert.equal(found, null);
  });

  test('list() search treats a classic SQLi payload as an ordinary literal, never breaking out of its parameter (proves VULN-001 mitigation)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const before = await repository.list({});
    const totalBefore = before.length;

    // Neither payload should match anything real, nor should either one
    // throw, alter the table, or return every row (which `' OR '1'='1`
    // would do if it were ever concatenated into the WHERE clause instead
    // of bound as a parameter).
    const droppedTableResult = await repository.list({ search: "'; DROP TABLE tickets;--" });
    assert.deepEqual(droppedTableResult, []);

    const orTrueResult = await repository.list({ search: "' OR '1'='1" });
    assert.deepEqual(orTrueResult, []);

    // Prove the table is still intact and unchanged after the attempted
    // stacked-query drop.
    const after = await repository.list({});
    assert.equal(after.length, totalBefore);
  });

  test('list() filters by status and priority using bound parameters', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await repository.create({
      subject: 'repo_test_ticket',
      description: 'Filter target.',
      priority: 'critical',
      status: 'in_progress',
      requesterId,
    });

    const results = await repository.list({ status: 'in_progress', priority: 'critical' });
    assert.ok(results.length >= 1);
    assert.ok(results.every((ticket) => ticket.status === 'in_progress' && ticket.priority === 'critical'));
  });

  test('list() search matches subject/description via ILIKE', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await repository.create({
      subject: 'repo_test_ticket',
      description: 'Contains a UNIQUE_MARKER_XYZ token.',
      priority: 'medium',
      status: 'open',
      requesterId,
    });

    const results = await repository.list({ search: 'UNIQUE_MARKER_XYZ' });
    assert.ok(results.length >= 1);
    assert.ok(results.every((ticket) => ticket.description.includes('UNIQUE_MARKER_XYZ')));
  });
});
