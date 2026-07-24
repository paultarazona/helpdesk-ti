const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
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

describe('auth e2e (supertest against the real app, real Postgres)', () => {
  let dbAvailable = false;
  let app;
  let closeConnection;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[auth.e2e.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping auth e2e tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    app = require('../../../src/app');
    ({ closeConnection } = require('../../../src/db/connection'));
    const { db } = require('../../../src/db/connection');

    try {
      await db.migrate.latest();
      await db('users').where({ username: 'e2e_user' }).del();
    } catch (error) {
      console.log(`[auth.e2e.test.js] Could not prepare the test DB: ${error.message}`);
      dbAvailable = false;
    }
  });

  after(async () => {
    if (dbAvailable) {
      const { db } = require('../../../src/db/connection');
      await db('users').where({ username: 'e2e_user' }).del();
      await closeConnection();
    }
  });

  test('register -> login -> logout happy path', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const registerGet = await request(app).get('/register').expect(200);
    const registerCsrf = extractCsrf(registerGet.text);
    const registerCookie = extractCookie(registerGet.headers['set-cookie'], 'x-csrf-token');
    assert.ok(registerCsrf, 'expected a _csrf hidden field in the register form');

    const registerPost = await request(app)
      .post('/register')
      .set('Cookie', registerCookie)
      .type('form')
      .send({ username: 'e2e_user', email: 'e2e_user@example.com', password: 'Sup3rSecret', _csrf: registerCsrf })
      .expect(302);
    assert.equal(registerPost.headers.location, '/login');

    const loginGet = await request(app).get('/login').expect(200);
    const loginCsrf = extractCsrf(loginGet.text);
    const loginCookie = extractCookie(loginGet.headers['set-cookie'], 'x-csrf-token');

    const loginPost = await request(app)
      .post('/login')
      .set('Cookie', loginCookie)
      .type('form')
      .send({ username: 'e2e_user', password: 'Sup3rSecret', _csrf: loginCsrf })
      .expect(302);

    const tokenCookie = extractCookie(loginPost.headers['set-cookie'], 'token');
    assert.ok(tokenCookie, 'expected a token cookie to be set on successful login');

    const logoutGet = await request(app).get('/login').expect(200);
    const logoutCsrf = extractCsrf(logoutGet.text);
    const logoutCookie = extractCookie(logoutGet.headers['set-cookie'], 'x-csrf-token');

    const logoutPost = await request(app)
      .post('/logout')
      .set('Cookie', [tokenCookie, logoutCookie].join('; '))
      .type('form')
      .send({ _csrf: logoutCsrf })
      .expect(302);
    assert.equal(logoutPost.headers.location, '/login');

    const clearedCookie = extractCookie(logoutPost.headers['set-cookie'], 'token');
    assert.ok(clearedCookie, 'expected logout to clear the token cookie');
    // extractCookie() splits the raw `Set-Cookie` header on `;` and returns
    // only the `name=value` portion (e.g. "token=; Path=/; Expires=..."
    // becomes "token="), so the previous assertion here — matching against
    // /token=;/ — could never pass: the `;` it looked for was already
    // stripped off by extractCookie() itself. The correct check is that the
    // cleared cookie's value is empty.
    assert.equal(clearedCookie, 'token=');
  });

  test('rejects the classic SQLi payload at POST /login — proves VULN-001 mitigation', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const loginGet = await request(app).get('/login').expect(200);
    const loginCsrf = extractCsrf(loginGet.text);
    const loginCookie = extractCookie(loginGet.headers['set-cookie'], 'x-csrf-token');

    const response = await request(app)
      .post('/login')
      .set('Cookie', loginCookie)
      .type('form')
      .send({ username: "' OR '1'='1", password: "' OR '1'='1", _csrf: loginCsrf })
      .expect(401);

    assert.equal(response.headers['set-cookie']?.some((c) => c.startsWith('token=') && !c.startsWith('token=;')), false);
  });

  test('rejects a weak password at registration', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const registerGet = await request(app).get('/register').expect(200);
    const registerCsrf = extractCsrf(registerGet.text);
    const registerCookie = extractCookie(registerGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/register')
      .set('Cookie', registerCookie)
      .type('form')
      .send({ username: 'weak_pw_user', email: 'weak_pw_user@example.com', password: 'short1', _csrf: registerCsrf })
      .expect(400);
  });

  test('rejects a duplicate username/email at registration', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const registerGet = await request(app).get('/register').expect(200);
    const registerCsrf = extractCsrf(registerGet.text);
    const registerCookie = extractCookie(registerGet.headers['set-cookie'], 'x-csrf-token');

    const response = await request(app)
      .post('/register')
      .set('Cookie', registerCookie)
      .type('form')
      .send({ username: 'e2e_user', email: 'e2e_user@example.com', password: 'Sup3rSecret', _csrf: registerCsrf });

    assert.equal(response.status, 409);
  });

  test('rate-limits POST /login after repeated attempts — proves VULN-009 mitigation', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    let sawRateLimited = false;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const loginGet = await request(app).get('/login').expect(200);
      const loginCsrf = extractCsrf(loginGet.text);
      const loginCookie = extractCookie(loginGet.headers['set-cookie'], 'x-csrf-token');

      const response = await request(app)
        .post('/login')
        .set('Cookie', loginCookie)
        .type('form')
        .send({ username: 'nonexistent_rl_user', password: 'wrong-password-1', _csrf: loginCsrf });

      if (response.status === 429) {
        sawRateLimited = true;
        break;
      }
    }

    assert.equal(sawRateLimited, true, 'expected the 11th+ login attempt within the window to be rate-limited (429)');
  });
});
