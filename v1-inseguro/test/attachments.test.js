const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createAttachmentsRouter } = require('../src/modules/attachments/routes');
const { createTicketsRouter } = require('../src/modules/tickets/routes');

async function createAttachmentsApp(database) {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helpdesk-public-'));
  const uploadDir = path.join(publicDir, 'uploads');
  const app = express();
  app.use((request, _response, next) => {
    request.user = { id: 1, username: 'alice' };
    next();
  });
  app.use('/tickets', createAttachmentsRouter(database, uploadDir));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use('/tickets', createTicketsRouter(database));
  app.use(express.static(publicDir));
  app.use((error, _request, response, _next) => response.status(500).send(error.message));
  return { app, publicDir, uploadDir };
}

test('attachment upload preserves arbitrary type and original name in public storage', async (context) => {
  const queries = [];
  const { app, publicDir } = await createAttachmentsApp({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [] };
    }
  });
  context.after(() => fs.rm(publicDir, { recursive: true, force: true }));

  const response = await request(app)
    .post('/tickets/2/attachments')
    .attach('attachment', Buffer.from('<script>alert(1)</script>'), { filename: 'payload.html', contentType: 'text/html' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/tickets/2');
  assert.deepEqual(queries[0].values, [2, 1, 'payload.html', 'uploads/payload.html', 'text/html', 25]);
  const served = await request(app).get('/uploads/payload.html');
  assert.equal(served.status, 200);
  assert.match(served.text, /<script>alert\(1\)<\/script>/);
});

test('attachment storagePath permits reproducible path traversal outside uploads', async (context) => {
  const { app, publicDir } = await createAttachmentsApp({ query: async () => ({ rows: [] }) });
  context.after(() => fs.rm(publicDir, { recursive: true, force: true }));

  const response = await request(app)
    .post('/tickets/2/attachments')
    .field('storagePath', '../escaped.txt')
    .attach('attachment', Buffer.from('traversed'), { filename: 'safe.txt', contentType: 'text/plain' });

  assert.equal(response.status, 302);
  const served = await request(app).get('/escaped.txt');
  assert.equal(served.status, 200);
  assert.equal(served.text, 'traversed');
});

test('attachment upload errors reach the error handler', async (context) => {
  const { app, publicDir } = await createAttachmentsApp({ query: async () => { throw new Error('database unavailable'); } });
  context.after(() => fs.rm(publicDir, { recursive: true, force: true }));

  const response = await request(app)
    .post('/tickets/2/attachments')
    .attach('attachment', Buffer.from('file'), { filename: 'error.txt', contentType: 'text/plain' });

  assert.equal(response.status, 500);
  assert.match(response.text, /database unavailable/);
});

test('ticket detail lists attachment links and includes the multipart upload form', async (context) => {
  const { app, publicDir } = await createAttachmentsApp({
    query: async (sql) => {
      if (sql.includes('FROM comments')) return { rows: [] };
      if (sql.includes('FROM ticket_attachments')) return { rows: [{ original_name: 'payload.html', storage_path: 'uploads/payload.html' }] };
      return { rows: [{ id: 2, subject: 'VPN is unavailable', description: 'VPN error', status: 'open', priority: 'high', requester_username: 'alice' }] };
    }
  });
  context.after(() => fs.rm(publicDir, { recursive: true, force: true }));

  const response = await request(app).get('/tickets/2');

  assert.equal(response.status, 200);
  assert.match(response.text, /href="\/uploads\/payload.html"/);
  assert.match(response.text, /enctype="multipart\/form-data"/);
  assert.match(response.text, /name="storagePath"/);
});
