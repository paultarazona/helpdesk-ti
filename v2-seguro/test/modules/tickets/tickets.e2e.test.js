const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { env } = require('../../../src/config/env');

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

describe('tickets e2e (supertest against the real app, real Postgres)', () => {
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
        `[tickets.e2e.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping tickets e2e tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    app = require('../../../src/app');
    ({ db, closeConnection } = require('../../../src/db/connection'));

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[tickets.e2e.test.js] Could not prepare the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('tickets')
      .whereIn('subject', ['e2e_ticket_a', 'e2e_ticket_xss', 'e2e_ticket_crud'])
      .del();
    await db('users').whereIn('username', ['e2e_ticket_user_a', 'e2e_ticket_user_b']).del();

    [{ id: userAId }] = await db('users')
      .insert({
        username: 'e2e_ticket_user_a',
        email: 'e2e_ticket_user_a@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userA = { id: userAId, username: 'e2e_ticket_user_a', role: 'user' };

    [{ id: userBId }] = await db('users')
      .insert({
        username: 'e2e_ticket_user_b',
        email: 'e2e_ticket_user_b@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userB = { id: userBId, username: 'e2e_ticket_user_b', role: 'user' };
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('tickets').whereIn('requester_id', [userA.id, userB.id]).del();
      await db('users').whereIn('username', ['e2e_ticket_user_a', 'e2e_ticket_user_b']).del();
      await closeConnection();
    }
  });

  test('IDOR: user B gets a generic 404 viewing/editing/deleting user A\'s ticket — proves VULN-004 mitigation', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);

    const newFormGet = await request(app).get('/tickets/new').set('Cookie', `token=${tokenA}`).expect(200);
    const createCsrf = extractCsrf(newFormGet.text);
    const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

    const createResponse = await request(app)
      .post('/tickets')
      .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
      .type('form')
      .send({ subject: 'e2e_ticket_a', description: "User A's private ticket.", _csrf: createCsrf })
      .expect(302);

    const ticketId = createResponse.headers.location.split('/').pop();

    const tokenB = signToken(userB);

    // View
    await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenB}`).expect(404);

    // Edit form
    await request(app).get(`/tickets/${ticketId}/edit`).set('Cookie', `token=${tokenB}`).expect(404);

    // Edit submit
    const editFormGetAsB = await request(app)
      .get('/tickets/new')
      .set('Cookie', `token=${tokenB}`)
      .expect(200);
    const editCsrf = extractCsrf(editFormGetAsB.text);
    const editCsrfCookie = extractCookie(editFormGetAsB.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}`)
      .set('Cookie', [`token=${tokenB}`, editCsrfCookie].join('; '))
      .type('form')
      .send({
        subject: 'Hijacked',
        description: 'Hijacked',
        status: 'closed',
        priority: 'low',
        _csrf: editCsrf,
      })
      .expect(404);

    // Delete
    await request(app)
      .post(`/tickets/${ticketId}/delete`)
      .set('Cookie', [`token=${tokenB}`, editCsrfCookie].join('; '))
      .type('form')
      .send({ _csrf: editCsrf })
      .expect(404);

    // Owner can still view it fine — proves the ticket itself was untouched.
    await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
  });

  test('XSS: a <script> description is stored as-is but rendered escaped in the detail page — proves VULN-002 mitigation', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const payload = '<script>alert(1)</script>';

    const newFormGet = await request(app).get('/tickets/new').set('Cookie', `token=${tokenA}`).expect(200);
    const createCsrf = extractCsrf(newFormGet.text);
    const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

    const createResponse = await request(app)
      .post('/tickets')
      .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
      .type('form')
      .send({ subject: 'e2e_ticket_xss', description: payload, _csrf: createCsrf })
      .expect(302);

    const ticketId = createResponse.headers.location.split('/').pop();

    const storedRow = await db('tickets').where({ id: ticketId }).first();
    assert.equal(storedRow.description, payload, 'the raw payload must be stored as-is, not sanitized at write time');

    const showResponse = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);

    assert.equal(showResponse.text.includes('<script>alert(1)</script>'), false, 'the raw <script> tag must never appear unescaped in the rendered HTML');
    assert.ok(
      showResponse.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
      'the escaped entities for the payload must appear in the rendered HTML'
    );
  });

  test('full happy-path CRUD: create -> list/search/filter -> view -> edit -> close -> delete', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);

    const newFormGet = await request(app).get('/tickets/new').set('Cookie', `token=${tokenA}`).expect(200);
    const createCsrf = extractCsrf(newFormGet.text);
    const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

    const createResponse = await request(app)
      .post('/tickets')
      .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
      .type('form')
      .send({
        subject: 'e2e_ticket_crud',
        description: 'Full CRUD happy path.',
        priority: 'high',
        status: 'open',
        _csrf: createCsrf,
      })
      .expect(302);

    const ticketId = createResponse.headers.location.split('/').pop();
    assert.equal(createResponse.headers.location, `/tickets/${ticketId}`);

    // List — plain
    const listResponse = await request(app).get('/tickets').set('Cookie', `token=${tokenA}`).expect(200);
    assert.ok(listResponse.text.includes('e2e_ticket_crud'));

    // List — search finds it
    const searchResponse = await request(app)
      .get('/tickets')
      .query({ search: 'e2e_ticket_crud' })
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    assert.ok(searchResponse.text.includes('e2e_ticket_crud'));

    // List — filter by priority/status finds it
    const filterResponse = await request(app)
      .get('/tickets')
      .query({ status: 'open', priority: 'high' })
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    assert.ok(filterResponse.text.includes('e2e_ticket_crud'));

    // List — filter that excludes it
    const excludedResponse = await request(app)
      .get('/tickets')
      .query({ priority: 'low' })
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    assert.equal(excludedResponse.text.includes('e2e_ticket_crud'), false);

    // View detail
    const showResponse = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    assert.ok(showResponse.text.includes('Full CRUD happy path.'));

    // Edit
    const editFormGet = await request(app)
      .get(`/tickets/${ticketId}/edit`)
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    const editCsrf = extractCsrf(editFormGet.text);
    const editCsrfCookie = extractCookie(editFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}`)
      .set('Cookie', [`token=${tokenA}`, editCsrfCookie].join('; '))
      .type('form')
      .send({
        subject: 'e2e_ticket_crud',
        description: 'Edited description.',
        priority: 'critical',
        status: 'in_progress',
        _csrf: editCsrf,
      })
      .expect(302);

    const afterEdit = await db('tickets').where({ id: ticketId }).first();
    assert.equal(afterEdit.description, 'Edited description.');
    assert.equal(afterEdit.priority, 'critical');
    assert.equal(afterEdit.status, 'in_progress');

    // Close
    const closeFormGet = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    // show.ejs renders one csrfToken shared by both the close and delete
    // forms, so the first `_csrf` match in the page is the token to use.
    const closeCsrf = extractCsrf(closeFormGet.text);
    const closeCsrfCookie = extractCookie(closeFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}/close`)
      .set('Cookie', [`token=${tokenA}`, closeCsrfCookie].join('; '))
      .type('form')
      .send({ _csrf: closeCsrf })
      .expect(302);

    const afterClose = await db('tickets').where({ id: ticketId }).first();
    assert.equal(afterClose.status, 'closed');

    // Delete
    const deleteFormGet = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${tokenA}`).expect(200);
    const deleteCsrf = extractCsrf(deleteFormGet.text);
    const deleteCsrfCookie = extractCookie(deleteFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/tickets/${ticketId}/delete`)
      .set('Cookie', [`token=${tokenA}`, deleteCsrfCookie].join('; '))
      .type('form')
      .send({ _csrf: deleteCsrf })
      .expect(302);

    const afterDelete = await db('tickets').where({ id: ticketId }).first();
    assert.equal(afterDelete, undefined);
  });

  test('rejects unauthenticated access to any ticket route', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await request(app).get('/tickets').expect(401);
    await request(app).get('/tickets/new').expect(401);
    await request(app).get('/dashboard').expect(401);
  });

  test('rejects a create submission with an invalid payload (empty subject)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);

    const newFormGet = await request(app).get('/tickets/new').set('Cookie', `token=${tokenA}`).expect(200);
    const createCsrf = extractCsrf(newFormGet.text);
    const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/tickets')
      .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
      .type('form')
      .send({ subject: '', description: 'desc', _csrf: createCsrf })
      .expect(400);
  });
});
