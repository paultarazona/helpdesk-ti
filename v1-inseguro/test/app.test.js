const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('GET / renders the local-only security notice', async () => {
  const response = await request(app).get('/');

  assert.equal(response.status, 200);
  assert.match(response.text, /IT Helpdesk Security Lab/);
  assert.match(response.text, /local isolated environment/i);
  assert.equal(response.headers['access-control-allow-origin'], '*');
});

test('invalid JSON exposes its stack trace in v1', async () => {
  const response = await request(app)
    .post('/')
    .set('Content-Type', 'application/json')
    .send('{');

  assert.equal(response.status, 500);
  assert.match(response.text, /SyntaxError/);
});
