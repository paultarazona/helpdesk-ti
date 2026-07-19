const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createAdminRouter } = require('../src/modules/admin/routes');

function createAdminApp(database) {
  const app = express();
  app.use((request, _response, next) => {
    request.user = { id: 1, username: 'alice', role: 'user' };
    next();
  });
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use('/admin', createAdminRouter(database));
  app.use((error, _request, response, _next) => response.status(500).send(error.message));
  return app;
}

test('a normal authenticated user can view the admin panel', async () => {
  const app = createAdminApp({
    query: async () => ({ rows: [{ id: 1, username: 'alice', email: 'alice@example.test', role: 'user' }] })
  });

  const response = await request(app).get('/admin');

  assert.equal(response.status, 200);
  assert.match(response.text, /Administration/);
  assert.match(response.text, /alice@example\.test/);
  assert.match(response.text, /user/);
});

test('admin query failures reach the error handler', async () => {
  const app = createAdminApp({ query: async () => { throw new Error('database unavailable'); } });

  const response = await request(app).get('/admin');

  assert.equal(response.status, 500);
  assert.match(response.text, /database unavailable/);
});

test('the vulnerability catalog and local validation checklist cover all fourteen entries', async () => {
  const catalog = await fs.readFile(path.join(__dirname, '..', 'VULNERABILITIES.md'), 'utf8');
  const checklist = await fs.readFile(path.join(__dirname, '..', '..', 'docs', 'testing', 'v1-local-validation.md'), 'utf8');

  for (let number = 1; number <= 14; number += 1) {
    const id = `VULN-${String(number).padStart(3, '0')}`;
    assert.match(catalog, new RegExp(id));
    assert.match(checklist, new RegExp(id));
  }
});
