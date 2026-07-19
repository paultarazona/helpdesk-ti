const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createAssetsRouter } = require('../src/modules/assets/routes');

function assetFixture(overrides = {}) {
  return {
    id: 2,
    name: 'Bob File Server',
    asset_type: 'server',
    ip_address: '10.10.0.22',
    assigned_username: 'bob',
    created_by_username: 'dana.agent',
    ...overrides
  };
}

function createAssetsApp(database) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use((request, _response, next) => {
    request.user = { id: 1, username: 'alice', role: 'user' };
    next();
  });
  app.use('/assets', createAssetsRouter(database));
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });
  return app;
}

test('asset search concatenates name and IP filters into the SQL query', async () => {
  const queries = [];
  const app = createAssetsApp({
    query: async (sql) => {
      queries.push(sql);
      return { rows: [assetFixture()] };
    }
  });

  const response = await request(app).get('/assets').query({ search: "' UNION SELECT 1--" });

  assert.equal(response.status, 200);
  assert.match(queries[0], /a\.name ILIKE/);
  assert.match(queries[0], /a\.ip_address ILIKE/);
  assert.match(queries[0], /UNION SELECT 1--/);
  assert.match(response.text, /Bob File Server/);
});

test('asset creation associates the asset with its submitted user and authenticated creator', async () => {
  const queries = [];
  const app = createAssetsApp({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [{ id: 4 }] };
    }
  });

  const response = await request(app)
    .post('/assets')
    .type('form')
    .send({ name: 'New Router', assetType: 'router', ipAddress: '10.10.0.4', assignedToUserId: '2' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/assets/4');
  assert.match(queries[0].sql, /INSERT INTO assets/);
  assert.deepEqual(queries[0].values, ['New Router', 'router', '10.10.0.4', '2', 1]);
});

test('asset details expose tickets and are accessible by another users supplied ID', async () => {
  const queries = [];
  const app = createAssetsApp({
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes('FROM tickets')) {
        return { rows: [{ id: 8, subject: 'File share is unavailable', status: 'open' }] };
      }
      return { rows: [assetFixture()] };
    }
  });

  const response = await request(app).get('/assets/2');

  assert.equal(response.status, 200);
  assert.match(response.text, /File share is unavailable/);
  assert.match(queries[0], /WHERE a\.id = 2/);
  assert.doesNotMatch(queries[0], /assigned_to_user_id\s*=/);
});

test('asset edit and delete operate on the supplied ID without an ownership check', async () => {
  const queries = [];
  const app = createAssetsApp({
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (sql.includes('SELECT a.*')) return { rows: [assetFixture()] };
      return { rows: [] };
    }
  });

  const editResponse = await request(app).get('/assets/2/edit');
  const updateResponse = await request(app)
    .post('/assets/2')
    .type('form')
    .send({ name: 'Changed Server', assetType: 'server', ipAddress: '10.10.0.9', assignedToUserId: '' });
  const deleteResponse = await request(app).post('/assets/2/delete');

  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Edit asset/);
  assert.equal(updateResponse.headers.location, '/assets/2');
  assert.equal(deleteResponse.headers.location, '/assets');
  assert.match(queries.at(-2).sql, /WHERE id = \$5/);
  assert.doesNotMatch(queries.at(-2).sql, /WHERE[^;]*assigned_to_user_id/);
  assert.match(queries.at(-1).sql, /DELETE FROM assets WHERE id = 2/);
});

test('asset form lists users and missing assets return 404', async () => {
  const app = createAssetsApp({
    query: async (sql) => {
      if (sql.includes('FROM users')) return { rows: [{ id: 1, username: 'alice' }] };
      return { rows: [] };
    }
  });
  const [newResponse, detailResponse, editResponse] = await Promise.all([
    request(app).get('/assets/new'),
    request(app).get('/assets/999'),
    request(app).get('/assets/999/edit')
  ]);

  assert.equal(newResponse.status, 200);
  assert.match(newResponse.text, /alice/);
  assert.equal(detailResponse.status, 404);
  assert.equal(editResponse.status, 404);
});

test('asset routes delegate database failures to the error handler', async () => {
  const app = createAssetsApp({ query: async () => { throw new Error('database unavailable'); } });
  const responses = await Promise.all([
    request(app).get('/assets'),
    request(app).get('/assets/new'),
    request(app).post('/assets').type('form').send({}),
    request(app).get('/assets/2/edit'),
    request(app).post('/assets/2').type('form').send({}),
    request(app).post('/assets/2/delete'),
    request(app).get('/assets/2')
  ]);

  for (const response of responses) {
    assert.equal(response.status, 500);
    assert.match(response.text, /database unavailable/);
  }
});
