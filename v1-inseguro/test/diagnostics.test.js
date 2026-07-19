const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createDiagnosticsRouter } = require('../src/modules/diagnostics/routes');

function createDiagnosticsApp(execute, requestUrl) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((request, _response, next) => {
    request.user = { id: 1, username: 'alice' };
    next();
  });
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use('/diagnostics', createDiagnosticsRouter(execute, requestUrl));
  app.use((error, _request, response, _next) => response.status(500).send(error.message));
  return app;
}

test('diagnostics page exposes ping and health-check forms', async () => {
  const app = createDiagnosticsApp(() => {}, async () => ({}));

  const response = await request(app).get('/diagnostics');

  assert.equal(response.status, 200);
  assert.match(response.text, /action="\/diagnostics\/ping"/);
  assert.match(response.text, /name="target"/);
  assert.match(response.text, /action="\/diagnostics\/health-check"/);
  assert.match(response.text, /name="url"/);
});

test('ping concatenates an attacker-controlled target into a shell command', async () => {
  const commands = [];
  const app = createDiagnosticsApp((command, callback) => {
    commands.push(command);
    callback(null, 'PING completed', '');
  }, async () => ({}));

  const response = await request(app)
    .post('/diagnostics/ping')
    .type('form')
    .send({ target: '127.0.0.1; id' });

  assert.equal(response.status, 200);
  assert.equal(commands[0], 'ping -c 1 127.0.0.1; id');
  assert.match(response.text, /PING completed/);
});

test('health-check fetches an attacker-controlled URL without destination restrictions', async () => {
  const requestedUrls = [];
  const app = createDiagnosticsApp(() => {}, async (url) => {
    requestedUrls.push(url);
    return { status: 200, text: async () => 'internal service response' };
  });

  const response = await request(app)
    .post('/diagnostics/health-check')
    .type('form')
    .send({ url: 'http://127.0.0.1:5432/private' });

  assert.equal(response.status, 200);
  assert.deepEqual(requestedUrls, ['http://127.0.0.1:5432/private']);
  assert.match(response.text, /internal service response/);
});

test('diagnostic execution errors reach the error handler', async () => {
  const app = createDiagnosticsApp((_command, callback) => callback(new Error('ping unavailable')), async () => ({}));

  const response = await request(app)
    .post('/diagnostics/ping')
    .type('form')
    .send({ target: '127.0.0.1' });

  assert.equal(response.status, 500);
  assert.match(response.text, /ping unavailable/);
});

test('health-check errors reach the error handler', async () => {
  const app = createDiagnosticsApp(() => {}, async () => { throw new Error('service unreachable'); });

  const response = await request(app)
    .post('/diagnostics/health-check')
    .type('form')
    .send({ url: 'http://127.0.0.1:5432/private' });

  assert.equal(response.status, 500);
  assert.match(response.text, /service unreachable/);
});
