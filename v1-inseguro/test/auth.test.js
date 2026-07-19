const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');
const { createAuthRouter } = require('../src/modules/auth/routes');
const { requireAuth } = require('../src/core/middleware/auth');

function createTestApp(database) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(createAuthRouter(database));
  app.get('/protected', requireAuth, (request, response) => {
    response.json({ user: request.user });
  });
  return app;
}

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

test('a valid JWT cookie grants access to protected routes', async () => {
  const app = createTestApp({ query: async () => ({ rows: [] }) });
  const token = jwt.sign({ id: 1, username: 'alice', role: 'user' }, config.jwtSecret);

  const response = await request(app).get('/protected').set('Cookie', `token=${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.user.username, 'alice');
});
