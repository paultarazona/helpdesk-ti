const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { env } = require('../../../src/config/env');

// e2e tests against the real app + real Postgres, same pattern as
// test/modules/tickets/tickets.e2e.test.js. Skips (t.skip()) rather than
// fake-passing when no reachable test database exists.
//
// Fixture naming note: uses 'e2e_comment_*' names, unique to this module,
// for the same reason documented in test/modules/assets/repository.test.js
// (avoids cross-file cleanup collisions under node --test's concurrent
// runner).

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

function extractCsrf(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : null;
}

function extractCookie(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const entry = setCookieHeader.find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? entry.split(';')[0] : null;
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

async function createTicketAs(app, token, subject) {
  const newFormGet = await request(app).get('/tickets/new').set('Cookie', `token=${token}`).expect(200);
  const csrf = extractCsrf(newFormGet.text);
  const csrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

  const createResponse = await request(app)
    .post('/tickets')
    .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
    .type('form')
    .send({ subject, description: 'Ticket used by comments e2e tests.', _csrf: csrf })
    .expect(302);

  return createResponse.headers.location.split('/').pop();
}

describe('comments e2e (supertest against the real app, real Postgres)', () => {
  let dbAvailable = false;
  let app;
  let db;
  let closeConnection;
  let userA;
  let userB;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[comments.e2e.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping comments e2e tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    app = require('../../../src/app');
    ({ db, closeConnection } = require('../../../src/db/connection'));

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[comments.e2e.test.js] Could not prepare the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('tickets')
      .whereIn('subject', ['e2e_comment_ticket_idor', 'e2e_comment_ticket_xss', 'e2e_comment_ticket_crud'])
      .del();
    await db('users').whereIn('username', ['e2e_comment_user_a', 'e2e_comment_user_b']).del();

    let userAId;
    let userBId;

    [{ id: userAId }] = await db('users')
      .insert({
        username: 'e2e_comment_user_a',
        email: 'e2e_comment_user_a@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userA = { id: userAId, username: 'e2e_comment_user_a', role: 'user' };

    [{ id: userBId }] = await db('users')
      .insert({
        username: 'e2e_comment_user_b',
        email: 'e2e_comment_user_b@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userB = { id: userBId, username: 'e2e_comment_user_b', role: 'user' };
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('tickets').whereIn('requester_id', [userA.id, userB.id]).del();
      await db('users').whereIn('username', ['e2e_comment_user_a', 'e2e_comment_user_b']).del();
      await closeConnection();
    }
  });

  test('IDOR: user B gets a generic 404 trying to comment on or list user A\'s ticket — proves VULN-004 mitigation extends to comments', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_comment_ticket_idor');

    const tokenB = signToken(userB);

    // Viewing the ticket (and therefore its comments) is a 404 for user B.
    await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenB}`).expect(404);

    // Posting a comment as user B is also a 404, never a 403 (would leak
    // existence) and never a 302/200 (would mean the comment was created).
    const newFormGetAsB = await request(app).get('/tickets/new').set('Cookie', `token=${tokenB}`).expect(200);
    const csrfB = extractCsrf(newFormGetAsB.text);
    const csrfCookieB = extractCookie(newFormGetAsB.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}/comments`)
      .set('Cookie', [`token=${tokenB}`, csrfCookieB].join('; '))
      .type('form')
      .send({ body: 'Trying to comment on a ticket that is not mine.', _csrf: csrfB })
      .expect(404);

    const commentsForTicket = await db('comments').where({ ticket_id: ticketId });
    assert.equal(commentsForTicket.length, 0, 'no comment should have been persisted for user B\'s IDOR attempt');
  });

  test('XSS: a comment with <script> and <img onerror> is saved but rendered inoffensively — proves VULN-002 mitigation for comments', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_comment_ticket_xss');

    const showFormGet = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    const commentCsrf = extractCsrf(showFormGet.text);
    const commentCsrfCookie = extractCookie(showFormGet.headers['set-cookie'], 'x-csrf-token');

    const payload = 'Look: <script>alert(1)</script> and <img src=x onerror=alert(1)> done.';

    await request(app)
      .post(`/tickets/${ticketId}/comments`)
      .set('Cookie', [`token=${tokenA}`, commentCsrfCookie].join('; '))
      .type('form')
      .send({ body: payload, _csrf: commentCsrf })
      .expect(302);

    const storedRow = await db('comments').where({ ticket_id: ticketId }).first();
    assert.ok(storedRow, 'the comment must have been persisted');
    assert.equal(
      storedRow.body.includes('<script>'),
      false,
      'the stored body must already be sanitized (script tag stripped) — this module sanitizes on write'
    );
    assert.equal(storedRow.body.includes('<img'), false, 'the stored body must not contain the raw <img> tag either');

    const showResponse = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);

    assert.equal(
      showResponse.text.includes('<script>alert(1)</script>'),
      false,
      'the raw <script> tag must never appear unescaped in the rendered HTML'
    );
    assert.equal(
      showResponse.text.includes('onerror=alert(1)'),
      false,
      'the raw onerror handler must never appear in the rendered HTML'
    );
    assert.ok(showResponse.text.includes('Look:'), 'the harmless surrounding text must still be rendered');
  });

  test('full happy-path: add a comment and see it on the ticket detail page', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_comment_ticket_crud');

    const showBefore = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    assert.ok(showBefore.text.includes('Todav') , 'the empty-state message should render before any comment exists');

    const csrf = extractCsrf(showBefore.text);
    const csrfCookie = extractCookie(showBefore.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}/comments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .type('form')
      .send({ body: 'The VPN reconnect worked, thanks!', _csrf: csrf })
      .expect(302)
      .expect('Location', `/tickets/${ticketId}`);

    const showAfter = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    assert.ok(showAfter.text.includes('The VPN reconnect worked, thanks!'));
    assert.ok(showAfter.text.includes('e2e_comment_user_a'));
  });

  test('rejects a comment submission with an invalid payload (empty body)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_comment_ticket_crud');

    const showGet = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    const csrf = extractCsrf(showGet.text);
    const csrfCookie = extractCookie(showGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}/comments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .type('form')
      .send({ body: '', _csrf: csrf })
      .expect(400);
  });

  test('rejects unauthenticated comment creation', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await request(app).post('/tickets/1/comments').type('form').send({ body: 'anonymous' }).expect(401);
  });
});
