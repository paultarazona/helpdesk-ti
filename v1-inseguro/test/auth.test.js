const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');
const { createAuthRouter } = require('../src/modules/auth/routes');
const { attachUser, requireAuth } = require('../src/core/middleware/auth');
const { useI18n } = require('./helpers/i18n');

function createTestApp(database) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use(express.urlencoded({ extended: false }));
  useI18n(app);
  app.use(attachUser);
  app.use(createAuthRouter(database));
  app.get('/protected', requireAuth, (request, response) => {
    response.json({ user: request.user });
  });
  return app;
}

test('registration and login forms render', async () => {
  const app = createTestApp({ query: async () => ({ rows: [] }) });

  const [registerResponse, loginResponse] = await Promise.all([
    request(app).get('/register'),
    request(app).get('/login')
  ]);

  assert.equal(registerResponse.status, 200);
  assert.match(registerResponse.text, /Register for IT Helpdesk/);
  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.text, /IT Helpdesk Login/);
});

test('registration persists the submitted plaintext password', async () => {
  const queries = [];
  const app = createTestApp({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [{ id: 5 }] };
    }
  });

  const response = await request(app)
    .post('/register')
    .type('form')
    .send({ username: 'new.user', email: 'new.user@example.test', password: 'plain-password' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/login');
  assert.equal(queries[0].values[2], 'plain-password');
});

test('login concatenates user input and issues a JWT without expiry', async () => {
  const queries = [];
  const app = createTestApp({
    query: async (sql) => {
      queries.push(sql);
      return { rows: [{ id: 1, username: 'alice', role: 'user' }] };
    }
  });
  const username = "alice' OR '1'='1";

  const response = await request(app)
    .post('/login')
    .type('form')
    .send({ username, password: 'ignored' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/dashboard');
  assert.match(queries[0], new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const token = response.headers['set-cookie'][0].split(';')[0].replace('token=', '');
  assert.equal(jwt.decode(token).exp, undefined);
});

test('login returns to its form when no user matches', async () => {
  const app = createTestApp({ query: async () => ({ rows: [] }) });

  const response = await request(app)
    .post('/login')
    .type('form')
    .send({ username: 'unknown', password: 'wrong' });

  assert.equal(response.status, 401);
  assert.match(response.text, /Invalid credentials/);
});

test('a valid JWT cookie grants access to protected routes', async () => {
  const app = createTestApp({ query: async () => ({ rows: [] }) });
  const token = jwt.sign({ id: 1, username: 'alice', role: 'user' }, config.jwtSecret);

  const response = await request(app).get('/protected').set('Cookie', `token=${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.user.username, 'alice');
});

test('missing or invalid cookies redirect protected requests to login', async () => {
  const app = createTestApp({ query: async () => ({ rows: [] }) });

  const [missingCookie, invalidCookie] = await Promise.all([
    request(app).get('/protected'),
    request(app).get('/protected').set('Cookie', 'token=invalid')
  ]);

  assert.equal(missingCookie.status, 302);
  assert.equal(missingCookie.headers.location, '/login');
  assert.equal(invalidCookie.status, 302);
  assert.equal(invalidCookie.headers.location, '/login');
});

test('logout clears the JWT cookie', async () => {
  const app = createTestApp({ query: async () => ({ rows: [] }) });

  const response = await request(app).post('/logout');

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/login');
  assert.match(response.headers['set-cookie'][0], /token=;/);
});
