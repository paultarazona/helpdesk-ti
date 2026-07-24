const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { env } = require('../../../src/config/env');

// Integration tests against a real Postgres instance, same pattern as
// test/modules/comments/repository.test.js. Skips (t.skip()) rather than
// fake-passing when no reachable test database exists.
//
// Fixture naming note: uses 'repo_test_attachment_*' names, unique to this
// module, for the same reason documented in test/modules/assets/repository.test.js
// (avoids cross-file cleanup collisions under node --test's concurrent runner).

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

describe('AttachmentsRepository (integration, real Postgres)', () => {
  let dbAvailable = false;
  let db;
  let closeConnection;
  let AttachmentsRepository;
  let TicketsRepository;
  let repository;
  let ticketsRepository;
  let uploaderId;
  let ticketId;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[attachments/repository.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping AttachmentsRepository integration tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    ({ db, closeConnection } = require('../../../src/db/connection'));
    ({ AttachmentsRepository } = require('../../../src/modules/attachments/repository'));
    ({ TicketsRepository } = require('../../../src/modules/tickets/repository'));
    repository = new AttachmentsRepository(db);
    ticketsRepository = new TicketsRepository(db);

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[attachments/repository.test.js] Could not run migrations against the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('users').where({ username: 'repo_test_attachment_uploader' }).del();

    [{ id: uploaderId }] = await db('users')
      .insert({
        username: 'repo_test_attachment_uploader',
        email: 'repo_test_attachment_uploader@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');

    ticketId = await ticketsRepository.create({
      subject: 'repo_test_attachment_ticket',
      description: 'Ticket used by attachments repository integration tests.',
      priority: 'medium',
      status: 'open',
      requesterId: uploaderId,
    });
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('attachments').where({ ticket_id: ticketId }).del();
      await db('tickets').where({ id: ticketId }).del();
      await db('users').where({ username: 'repo_test_attachment_uploader' }).del();
      await closeConnection();
    }
  });

  test('create() + findById() persists an attachment row and returns it', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      ticketId,
      uploadedBy: uploaderId,
      originalFilename: 'error-screenshot.png',
      storedFilename: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
      mimeType: 'image/png',
      sizeBytes: 1234,
    });

    const found = await repository.findById(id);

    assert.ok(found);
    assert.equal(found.original_filename, 'error-screenshot.png');
    assert.equal(found.stored_filename, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png');
    assert.equal(found.mime_type, 'image/png');
    assert.equal(found.size_bytes, 1234);
    assert.equal(found.ticket_id, ticketId);
    assert.equal(found.uploaded_by, uploaderId);
  });

  test('findById() returns null for an attachment that does not exist', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findById(999999999);
    assert.equal(found, null);
  });

  test('listByTicketId() returns attachments for that ticket ordered oldest-first', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await db('attachments').where({ ticket_id: ticketId }).del();

    const firstId = await repository.create({
      ticketId,
      uploadedBy: uploaderId,
      originalFilename: 'first.png',
      storedFilename: '11111111-1111-1111-1111-111111111111.png',
      mimeType: 'image/png',
      sizeBytes: 10,
    });
    const secondId = await repository.create({
      ticketId,
      uploadedBy: uploaderId,
      originalFilename: 'second.txt',
      storedFilename: '22222222-2222-2222-2222-222222222222.txt',
      mimeType: 'text/plain',
      sizeBytes: 20,
    });

    const results = await repository.listByTicketId(ticketId);

    assert.equal(results.length, 2);
    assert.equal(results[0].id, firstId);
    assert.equal(results[1].id, secondId);
  });

  test('listByTicketId() returns an empty array for a ticket with no attachments', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const otherTicketId = await ticketsRepository.create({
      subject: 'repo_test_attachment_ticket_empty',
      description: 'Ticket with no attachments.',
      priority: 'low',
      status: 'open',
      requesterId: uploaderId,
    });

    const results = await repository.listByTicketId(otherTicketId);
    assert.deepEqual(results, []);

    await db('tickets').where({ id: otherTicketId }).del();
  });

  test('delete() removes the attachment row', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({
      ticketId,
      uploadedBy: uploaderId,
      originalFilename: 'to-delete.png',
      storedFilename: '33333333-3333-3333-3333-333333333333.png',
      mimeType: 'image/png',
      sizeBytes: 5,
    });

    await repository.delete(id);
    const found = await repository.findById(id);
    assert.equal(found, null);
  });
});
