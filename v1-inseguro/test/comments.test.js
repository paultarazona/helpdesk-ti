const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createCommentsRouter } = require('../src/modules/comments/routes');
const { createTicketsRouter } = require('../src/modules/tickets/routes');

function createCommentsApp(database) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use((request, _response, next) => {
    request.user = { id: 1, username: 'alice', role: 'user' };
    next();
  });
  app.use('/tickets', createCommentsRouter(database));
  app.use('/tickets', createTicketsRouter(database));
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });
  return app;
}

test('an authenticated user can persist a comment for a ticket', async () => {
  const queries = [];
  const app = createCommentsApp({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [] };
    }
  });

  const response = await request(app)
    .post('/tickets/2/comments')
    .type('form')
    .send({ body: 'The VPN reconnect worked.' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/tickets/2');
  assert.match(queries[0].sql, /INSERT INTO comments/);
  assert.deepEqual(queries[0].values, ['2', 1, 'The VPN reconnect worked.']);
});

test('ticket detail renders persisted comment bodies without escaping', async () => {
  const queries = [];
  const app = createCommentsApp({
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes('FROM comments')) {
        return { rows: [{ id: 4, body: '<script>alert(1)</script>', author_username: 'bob' }] };
      }
      return {
        rows: [{
          id: 2,
          subject: 'VPN is unavailable',
          description: 'VPN error',
          status: 'open',
          priority: 'high',
          requester_username: 'alice'
        }]
      };
    }
  });

  const response = await request(app).get('/tickets/2');

  assert.equal(response.status, 200);
  assert.match(queries[1], /FROM comments/);
  assert.match(response.text, /<script>alert\(1\)<\/script>/);
  assert.match(response.text, /bob/);
  assert.match(response.text, /action="\/tickets\/2\/comments"/);
});

test('comment persistence errors reach the error handler', async () => {
  const app = createCommentsApp({ query: async () => { throw new Error('database unavailable'); } });

  const response = await request(app)
    .post('/tickets/2/comments')
    .type('form')
    .send({ body: 'Will fail' });

  assert.equal(response.status, 500);
  assert.match(response.text, /database unavailable/);
});
