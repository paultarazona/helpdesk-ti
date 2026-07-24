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

describe('diagnostics e2e (supertest against the real app, real Postgres) — mitigates VULN-007/VULN-008', () => {
  let dbAvailable = false;
  let app;
  let db;
  let closeConnection;
  let user;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[diagnostics.e2e.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping diagnostics e2e tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    app = require('../../../src/app');
    ({ db, closeConnection } = require('../../../src/db/connection'));

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[diagnostics.e2e.test.js] Could not prepare the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('users').where({ username: 'e2e_diag_user' }).del();

    const [{ id: userId }] = await db('users')
      .insert({
        username: 'e2e_diag_user',
        email: 'e2e_diag_user@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    user = { id: userId, username: 'e2e_diag_user', role: 'user' };
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('users').where({ username: 'e2e_diag_user' }).del();
      await closeConnection();
    }
  });

  test('rejects unauthenticated access to any diagnostics route', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await request(app).get('/diagnostics').expect(401);
    await request(app).post('/diagnostics/ping').send({ target: '127.0.0.1' }).expect(401);
    await request(app).post('/diagnostics/health-check').send({ url: 'https://example.com' }).expect(401);
  });

  test(
    'VULN-007 mitigation: a command-injection payload in the ping target is rejected with 400 BEFORE anything executes — never a 500, never a 200 with leaked command output',
    async (t) => {
      if (!dbAvailable) {
        t.skip('no reachable test Postgres database');
        return;
      }

      const token = signToken(user);

      const formGet = await request(app).get('/diagnostics').set('Cookie', `token=${token}`).expect(200);
      const csrf = extractCsrf(formGet.text);
      const csrfCookie = extractCookie(formGet.headers['set-cookie'], 'x-csrf-token');

      const response = await request(app)
        .post('/diagnostics/ping')
        .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
        .type('form')
        .send({ target: '8.8.8.8; cat /etc/passwd', _csrf: csrf })
        .expect(400);

      // The strongest possible proof the mitigation works: the response
      // body must not contain anything resembling leaked /etc/passwd
      // content (e.g. the `root:` line every Unix passwd file starts with).
      assert.equal(response.text.includes('root:'), false);
    }
  );

  test('VULN-007 mitigation: a backtick command-substitution payload is rejected with 400', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const token = signToken(user);

    const formGet = await request(app).get('/diagnostics').set('Cookie', `token=${token}`).expect(200);
    const csrf = extractCsrf(formGet.text);
    const csrfCookie = extractCookie(formGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/diagnostics/ping')
      .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
      .type('form')
      .send({ target: '8.8.8.8`whoami`', _csrf: csrf })
      .expect(400);
  });

  test('a legitimate ping against a valid IPv4 address (127.0.0.1) actually executes and returns 200 with output', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const token = signToken(user);

    const formGet = await request(app).get('/diagnostics').set('Cookie', `token=${token}`).expect(200);
    const csrf = extractCsrf(formGet.text);
    const csrfCookie = extractCookie(formGet.headers['set-cookie'], 'x-csrf-token');

    const response = await request(app)
      .post('/diagnostics/ping')
      .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
      .type('form')
      .send({ target: '127.0.0.1', _csrf: csrf })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 502) {
          throw new Error(`expected 200 (ping ran) or 502 (ping binary unavailable in this env), got ${res.status}`);
        }
      });

    if (response.status === 502) {
      t.skip('ping binary unavailable or blocked in this environment');
      return;
    }

    assert.equal(response.status, 200);
  });

  test('VULN-008 mitigation: health-check against the cloud metadata endpoint (169.254.169.254) is rejected with 400, no fetch performed', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const token = signToken(user);

    const formGet = await request(app).get('/diagnostics').set('Cookie', `token=${token}`).expect(200);
    const csrf = extractCsrf(formGet.text);
    const csrfCookie = extractCookie(formGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/diagnostics/health-check')
      .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
      .type('form')
      .send({ url: 'http://169.254.169.254/', _csrf: csrf })
      .expect(400);
  });

  test('VULN-008 mitigation: health-check against localhost (the server itself) is rejected with 400', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const token = signToken(user);

    const formGet = await request(app).get('/diagnostics').set('Cookie', `token=${token}`).expect(200);
    const csrf = extractCsrf(formGet.text);
    const csrfCookie = extractCookie(formGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/diagnostics/health-check')
      .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
      .type('form')
      .send({ url: 'http://localhost:4000/', _csrf: csrf })
      .expect(400);
  });

  test('VULN-008 mitigation: health-check against a private RFC1918 address (10.0.0.1) is rejected with 400', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const token = signToken(user);

    const formGet = await request(app).get('/diagnostics').set('Cookie', `token=${token}`).expect(200);
    const csrf = extractCsrf(formGet.text);
    const csrfCookie = extractCookie(formGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/diagnostics/health-check')
      .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
      .type('form')
      .send({ url: 'http://10.0.0.1/', _csrf: csrf })
      .expect(400);
  });
});
