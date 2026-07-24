const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { env } = require('../../../src/config/env');

// Integration tests against a real Postgres instance, same pattern as
// test/modules/tickets/repository.test.js. Skips (t.skip()) rather than
// fake-passing when no reachable test database exists.
//
// Fixture naming note: deliberately NOT reusing tickets/repository.test.js's
// 'repo_test_asset' fixture name. That file also creates an asset row named
// 'repo_test_asset' and cleans it up with `.where({ name: 'repo_test_asset' })`.
// Since `node --test` runs test files concurrently against the SAME real
// Postgres instance, sharing that literal name caused one file's cleanup to
// delete the other file's still-in-use row mid-run (observed as an FK
// violation deleting users while a ticket still referenced them). Use a
// name unique to this module's fixtures instead.

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

const FIXTURE_ASSET_NAME = 'repo_assetsmod_fixture';

describe('AssetsRepository (integration, real Postgres)', () => {
  let dbAvailable = false;
  let db;
  let closeConnection;
  let AssetsRepository;
  let repository;
  let creatorId;
  let assigneeId;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[assets/repository.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping AssetsRepository integration tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    ({ db, closeConnection } = require('../../../src/db/connection'));
    ({ AssetsRepository } = require('../../../src/modules/assets/repository'));
    repository = new AssetsRepository(db);

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[assets/repository.test.js] Could not run migrations against the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('assets').where({ name: FIXTURE_ASSET_NAME }).del();
    await db('users').whereIn('username', ['repo_assetsmod_creator', 'repo_assetsmod_assignee']).del();

    [{ id: creatorId }] = await db('users')
      .insert({
        username: 'repo_assetsmod_creator',
        email: 'repo_assetsmod_creator@example.com',
        password_hash: 'not-a-real-hash',
        role: 'agent',
      })
      .returning('id');

    [{ id: assigneeId }] = await db('users')
      .insert({
        username: 'repo_assetsmod_assignee',
        email: 'repo_assetsmod_assignee@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('tickets').where({ requester_id: creatorId }).del();
      await db('assets').where({ created_by_user_id: creatorId }).del();
      await db('users').whereIn('username', ['repo_assetsmod_creator', 'repo_assetsmod_assignee']).del();
      await closeConnection();
    }
  });

  test('create() + findById() persists an asset and returns it joined with assigned/creator usernames', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      name: FIXTURE_ASSET_NAME,
      assetType: 'server',
      ipAddress: '10.0.0.5',
      assignedToUserId: assigneeId,
      createdByUserId: creatorId,
    });

    const found = await repository.findById(id);

    assert.ok(found);
    assert.equal(found.name, FIXTURE_ASSET_NAME);
    assert.equal(found.asset_type, 'server');
    assert.equal(found.ip_address, '10.0.0.5');
    assert.equal(found.assigned_username, 'repo_assetsmod_assignee');
    assert.equal(found.created_by_username, 'repo_assetsmod_creator');
  });

  test('findById() returns null for an asset that does not exist', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findById(999999999);
    assert.equal(found, null);
  });

  test('update() changes only the provided fields', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      name: FIXTURE_ASSET_NAME,
      assetType: 'laptop',
      createdByUserId: creatorId,
    });

    const updated = await repository.update(id, { name: `${FIXTURE_ASSET_NAME}_renamed`, assetType: 'laptop' });

    assert.equal(updated.name, `${FIXTURE_ASSET_NAME}_renamed`);
    assert.equal(updated.asset_type, 'laptop');
  });

  test('delete() removes the asset', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      name: FIXTURE_ASSET_NAME,
      assetType: 'printer',
      createdByUserId: creatorId,
    });

    await repository.delete(id);
    const found = await repository.findById(id);
    assert.equal(found, null);
  });

  test('list() search by name/IP treats classic SQLi payloads as ordinary literals, never breaking out of its parameter (proves VULN-001 mitigation)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const before = await repository.list({});
    const totalBefore = before.length;

    // Neither payload should match anything real, nor should either one
    // throw, alter the table, or return every row (which `' OR '1'='1`
    // would do if it were ever concatenated into the WHERE clause instead
    // of bound as a parameter, as v1-inseguro/src/modules/assets/routes.js
    // does).
    const droppedTableResult = await repository.list({ search: "'; DROP TABLE assets;--" });
    assert.deepEqual(droppedTableResult, []);

    const orTrueResult = await repository.list({ search: "' OR '1'='1" });
    assert.deepEqual(orTrueResult, []);

    // Prove the table is still intact and unchanged after the attempted
    // stacked-query drop.
    const after = await repository.list({});
    assert.equal(after.length, totalBefore);
  });

  test('list() search matches by name via ILIKE (case-insensitive, partial)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await repository.create({
      name: FIXTURE_ASSET_NAME,
      assetType: 'switch',
      createdByUserId: creatorId,
    });

    const results = await repository.list({ search: FIXTURE_ASSET_NAME.toUpperCase() });
    assert.ok(results.length >= 1);
    assert.ok(results.every((asset) => asset.name.toLowerCase().includes(FIXTURE_ASSET_NAME)));
  });

  test('list() search matches by IP address via ILIKE', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await repository.create({
      name: FIXTURE_ASSET_NAME,
      assetType: 'router',
      ipAddress: '172.16.9.9',
      createdByUserId: creatorId,
    });

    const results = await repository.list({ search: '172.16.9.9' });
    assert.ok(results.length >= 1);
    assert.ok(results.every((asset) => asset.ip_address === '172.16.9.9'));
  });

  test('listTicketsForAsset() returns tickets linked to the asset', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const assetId = await repository.create({
      name: FIXTURE_ASSET_NAME,
      assetType: 'server',
      createdByUserId: creatorId,
    });

    const [{ id: linkedTicketId }] = await db('tickets')
      .insert({
        subject: `${FIXTURE_ASSET_NAME} ticket`,
        description: 'Linked to asset.',
        priority: 'medium',
        status: 'open',
        requester_id: creatorId,
        asset_id: assetId,
      })
      .returning('id');

    const tickets = await repository.listTicketsForAsset(assetId);
    assert.ok(tickets.length >= 1);
    assert.ok(tickets.every((ticket) => ticket.subject === `${FIXTURE_ASSET_NAME} ticket`));

    // Clean up by the ticket's own id (not by asset_id), so this cleanup
    // stays correct even if the asset row itself changes concurrently.
    await db('tickets').where({ id: linkedTicketId }).del();
  });
});
