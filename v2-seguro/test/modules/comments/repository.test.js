const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { env } = require('../../../src/config/env');

// Integration tests against a real Postgres instance, same pattern as
// test/modules/tickets/repository.test.js. Skips (t.skip()) rather than
// fake-passing when no reachable test database exists.
//
// Fixture naming note: deliberately using names unique to this module
// ('repo_test_comment_*') — node --test runs test files concurrently
// against the same real Postgres instance, and a prior collision between
// tickets/repository.test.js and assets/repository.test.js (documented in
// test/modules/assets/repository.test.js) showed that sharing a fixture
// name across files causes one file's cleanup to delete rows another file
// still depends on mid-run (observed as an FK violation).

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

describe('CommentsRepository (integration, real Postgres)', () => {
  let dbAvailable = false;
  let db;
  let closeConnection;
  let CommentsRepository;
  let TicketsRepository;
  let repository;
  let ticketsRepository;
  let authorId;
  let ticketId;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[comments/repository.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping CommentsRepository integration tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    ({ db, closeConnection } = require('../../../src/db/connection'));
    ({ CommentsRepository } = require('../../../src/modules/comments/repository'));
    ({ TicketsRepository } = require('../../../src/modules/tickets/repository'));
    repository = new CommentsRepository(db);
    ticketsRepository = new TicketsRepository(db);

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[comments/repository.test.js] Could not run migrations against the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('users').where({ username: 'repo_test_comment_author' }).del();

    [{ id: authorId }] = await db('users')
      .insert({
        username: 'repo_test_comment_author',
        email: 'repo_test_comment_author@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');

    ticketId = await ticketsRepository.create({
      subject: 'repo_test_comment_ticket',
      description: 'Ticket used by comments repository integration tests.',
      priority: 'medium',
      status: 'open',
      requesterId: authorId,
    });
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('comments').where({ ticket_id: ticketId }).del();
      await db('tickets').where({ id: ticketId }).del();
      await db('users').where({ username: 'repo_test_comment_author' }).del();
      await closeConnection();
    }
  });

  test('create() + findById() persists a comment and returns it joined with the author', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const id = await repository.create({ ticketId, authorId, body: 'Integration test comment.' });
    const found = await repository.findById(id);

    assert.ok(found);
    assert.equal(found.body, 'Integration test comment.');
    assert.equal(found.author_username, 'repo_test_comment_author');
    assert.equal(found.ticket_id, ticketId);
  });

  test('findById() returns null for a comment that does not exist', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const found = await repository.findById(999999999);
    assert.equal(found, null);
  });

  test('listByTicketId() returns comments for that ticket ordered oldest-first', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await db('comments').where({ ticket_id: ticketId }).del();

    const firstId = await repository.create({ ticketId, authorId, body: 'First comment.' });
    const secondId = await repository.create({ ticketId, authorId, body: 'Second comment.' });

    const results = await repository.listByTicketId(ticketId);

    assert.equal(results.length, 2);
    assert.equal(results[0].id, firstId);
    assert.equal(results[1].id, secondId);
    assert.ok(results.every((comment) => comment.author_username === 'repo_test_comment_author'));
  });

  test('listByTicketId() returns an empty array for a ticket with no comments', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const otherTicketId = await ticketsRepository.create({
      subject: 'repo_test_comment_ticket_empty',
      description: 'Ticket with no comments.',
      priority: 'low',
      status: 'open',
      requesterId: authorId,
    });

    const results = await repository.listByTicketId(otherTicketId);
    assert.deepEqual(results, []);

    await db('tickets').where({ id: otherTicketId }).del();
  });
});
