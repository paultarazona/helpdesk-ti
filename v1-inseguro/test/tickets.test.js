const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createTicketsRouter } = require('../src/modules/tickets/routes');

function ticketFixture(overrides = {}) {
  return {
    id: 2,
    subject: 'VPN is unavailable',
    description: 'VPN error',
    status: 'open',
    priority: 'high',
    requester_username: 'bob',
    asset_name: 'Bob File Server',
    ...overrides
  };
}

function createTicketsApp(database) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use((request, _response, next) => {
    request.user = { id: 1, username: 'alice', role: 'user' };
    next();
  });
  app.use('/tickets', createTicketsRouter(database));
  return app;
}

test('ticket search concatenates filters and reflects the search text without escaping', async () => {
  const queries = [];
  const app = createTicketsApp({
    query: async (sql) => {
      queries.push(sql);
      return { rows: [ticketFixture()] };
    }
  });
  const search = '<script>alert(1)</script>';

  const response = await request(app)
    .get('/tickets')
    .query({ search, status: 'open', priority: 'high' });

  assert.equal(response.status, 200);
  assert.match(queries[0], /status = 'open'/);
  assert.match(queries[0], /priority = 'high'/);
  assert.match(queries[0], /<script>alert\(1\)<\/script>/);
  assert.match(response.text, /<script>alert\(1\)<\/script>/);
});

test('ticket detail renders its description raw and does not scope the query to the requester', async () => {
  const queries = [];
  const app = createTicketsApp({
    query: async (sql) => {
      queries.push(sql);
      return { rows: [ticketFixture({ description: '<strong>unescaped</strong>' })] };
    }
  });

  const response = await request(app).get('/tickets/2');

  assert.equal(response.status, 200);
  assert.match(response.text, /<strong>unescaped<\/strong>/);
  assert.match(queries[0], /WHERE t\.id = 2/);
  assert.doesNotMatch(queries[0], /requester_id\s*=/);
});

test('ticket mutations use the authenticated user only for creation and require no CSRF token', async () => {
  const queries = [];
  const app = createTicketsApp({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [{ id: 3 }] };
    }
  });

  const createResponse = await request(app)
    .post('/tickets')
    .type('form')
    .send({ subject: 'New request', description: 'Needs help', priority: 'medium', assetId: '' });
  const closeResponse = await request(app).post('/tickets/2/close');

  assert.equal(createResponse.status, 302);
  assert.equal(createResponse.headers.location, '/tickets/3');
  assert.equal(queries[0].values[3], 1);
  assert.equal(closeResponse.status, 302);
  assert.equal(closeResponse.headers.location, '/tickets/2');
  assert.doesNotMatch(queries[1].sql, /requester_id\s*=/);
});
