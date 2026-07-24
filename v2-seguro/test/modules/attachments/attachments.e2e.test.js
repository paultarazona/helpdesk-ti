const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { env } = require('../../../src/config/env');

// e2e tests against the real app + real Postgres, same pattern as
// test/modules/tickets/tickets.e2e.test.js and
// test/modules/comments/comments.e2e.test.js. Skips (t.skip()) rather than
// fake-passing when no reachable test database exists.
//
// These are the security-critical tests that commit 44a1f1b's own message
// flagged as missing for VULN-006 (A05: Unrestricted Upload / CWE-434):
// content-sniffing rejection of a PHP file disguised as .png, path
// traversal rejection, IDOR on download, and oversized-file rejection.
//
// Fixture naming note: uses 'e2e_attachment_*' names, unique to this
// module, for the same reason documented in
// test/modules/assets/repository.test.js (avoids cross-file cleanup
// collisions under node --test's concurrent runner).

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

async function createTicketAs(app, token, subject) {
  const newFormGet = await request(app).get('/tickets/new').set('Cookie', `token=${token}`).expect(200);
  const csrf = extractCsrf(newFormGet.text);
  const csrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

  const createResponse = await request(app)
    .post('/tickets')
    .set('Cookie', [`token=${token}`, csrfCookie].join('; '))
    .type('form')
    .send({ subject, description: 'Ticket used by attachments e2e tests.', _csrf: csrf })
    .expect(302);

  return createResponse.headers.location.split('/').pop();
}

/**
 * Fetches the ticket detail page (which renders the upload form/CSRF
 * token) as `token`, so a fresh CSRF token + cookie pair can be used for a
 * subsequent multipart upload POST.
 */
async function getUploadCsrf(app, token, ticketId) {
  const showResponse = await request(app).get(`/tickets/${ticketId}`).set('Cookie', `token=${token}`).expect(200);
  const csrf = extractCsrf(showResponse.text);
  const csrfCookie = extractCookie(showResponse.headers['set-cookie'], 'x-csrf-token');
  return { csrf, csrfCookie };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('attachments e2e (supertest against the real app, real Postgres)', () => {
  let dbAvailable = false;
  let app;
  let db;
  let closeConnection;
  let userA;
  let userB;

  before(async () => {
    dbAvailable = await checkPortOpen(env.DB_HOST, env.DB_PORT);

    if (!dbAvailable) {
      console.log(
        `[attachments.e2e.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping attachments e2e tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    app = require('../../../src/app');
    ({ db, closeConnection } = require('../../../src/db/connection'));

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[attachments.e2e.test.js] Could not prepare the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('tickets')
      .whereIn('subject', [
        'e2e_attachment_ticket_a',
        'e2e_attachment_ticket_b',
        'e2e_attachment_ticket_idor',
        'e2e_attachment_ticket_oversized',
      ])
      .del();
    await db('users').whereIn('username', ['e2e_attachment_user_a', 'e2e_attachment_user_b']).del();

    [{ id: userAId }] = await db('users')
      .insert({
        username: 'e2e_attachment_user_a',
        email: 'e2e_attachment_user_a@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userA = { id: userAId, username: 'e2e_attachment_user_a', role: 'user' };

    [{ id: userBId }] = await db('users')
      .insert({
        username: 'e2e_attachment_user_b',
        email: 'e2e_attachment_user_b@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userB = { id: userBId, username: 'e2e_attachment_user_b', role: 'user' };
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('tickets').whereIn('requester_id', [userA.id, userB.id]).del();
      await db('users').whereIn('username', ['e2e_attachment_user_a', 'e2e_attachment_user_b']).del();
      await closeConnection();
    }
  });

  test('successful upload + download of a legit PNG', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_attachment_ticket_a');
    const { csrf, csrfCookie } = await getUploadCsrf(app, tokenA, ticketId);

    const legitPng = Buffer.concat([PNG_MAGIC, Buffer.from('real pixel data here')]);

    const uploadResponse = await request(app)
      .post(`/tickets/${ticketId}/attachments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .field('_csrf', csrf)
      .attach('attachment', legitPng, 'screenshot.png')
      .expect(302);

    assert.equal(uploadResponse.headers.location, `/tickets/${ticketId}`);

    const stored = await db('attachments').where({ ticket_id: ticketId }).first();
    assert.ok(stored, 'the attachment row must have been persisted');
    assert.equal(stored.original_filename, 'screenshot.png');
    assert.equal(stored.mime_type, 'image/png');
    // Stored filename is a server-generated UUID + detected extension,
    // never the client's original filename.
    assert.match(stored.stored_filename, /^[0-9a-f-]{36}\.png$/i);

    const downloadResponse = await request(app)
      .get(`/tickets/${ticketId}/attachments/${stored.id}/download`)
      .set('Cookie', `token=${tokenA}`)
      .expect(200);

    assert.equal(downloadResponse.headers['content-type'], 'image/png');
    assert.ok(Buffer.from(downloadResponse.body).equals(legitPng), 'downloaded bytes must match the uploaded bytes');
  });

  test('rejects a PHP webshell disguised as .png — proves VULN-006 content-sniffing mitigation', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_attachment_ticket_b');
    const { csrf, csrfCookie } = await getUploadCsrf(app, tokenA, ticketId);

    const phpWebshell = Buffer.from('<?php system($_GET["cmd"]); ?>');

    await request(app)
      .post(`/tickets/${ticketId}/attachments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .field('_csrf', csrf)
      .attach('attachment', phpWebshell, 'totally-a-screenshot.png')
      .expect(400);

    const stored = await db('attachments').where({ ticket_id: ticketId }).first();
    assert.equal(stored, undefined, 'no attachment row must have been persisted for a rejected upload');
  });

  test('rejects a path-traversal filename without ever escaping the storage directory', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_attachment_ticket_a');
    const { csrf, csrfCookie } = await getUploadCsrf(app, tokenA, ticketId);

    const legitPng = Buffer.concat([PNG_MAGIC, Buffer.from('real pixel data here')]);

    // The original filename is attacker-controlled multipart metadata. It
    // is never used to build a filesystem path (the on-disk name is always
    // a server-generated UUID — see service.js), so this upload succeeds
    // on content, but the traversal payload must never appear anywhere on
    // disk or in the stored_filename column.
    const uploadResponse = await request(app)
      .post(`/tickets/${ticketId}/attachments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .field('_csrf', csrf)
      .attach('attachment', legitPng, '../../../../etc/passwd.png')
      .expect(302);

    assert.equal(uploadResponse.headers.location, `/tickets/${ticketId}`);

    const stored = await db('attachments').where({ ticket_id: ticketId }).orderBy('id', 'desc').first();
    assert.ok(stored);
    // Multer/busboy already normalizes multipart filenames to a basename
    // before exposing `originalname` — the traversal segments never even
    // reach our code. Belt-and-suspenders: assert no '..' or path
    // separator survives in what we display either.
    assert.equal(stored.original_filename.includes('..'), false);
    assert.equal(stored.original_filename, 'passwd.png');
    assert.match(
      stored.stored_filename,
      /^[0-9a-f-]{36}\.png$/i,
      'the on-disk filename must be a server-generated UUID, never derived from the traversal payload'
    );
    assert.equal(stored.stored_filename.includes('..'), false);
    assert.equal(stored.stored_filename.includes('/'), false);
    assert.equal(stored.stored_filename.includes('\\'), false);
  });

  test('IDOR: user B cannot download an attachment on user A\'s ticket — proves ownership check on download', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_attachment_ticket_idor');
    const { csrf, csrfCookie } = await getUploadCsrf(app, tokenA, ticketId);

    const legitPng = Buffer.concat([PNG_MAGIC, Buffer.from('user a private pixel data')]);

    await request(app)
      .post(`/tickets/${ticketId}/attachments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .field('_csrf', csrf)
      .attach('attachment', legitPng, 'private.png')
      .expect(302);

    const stored = await db('attachments').where({ ticket_id: ticketId }).first();
    assert.ok(stored);

    const tokenB = signToken(userB);

    // Same generic 404 pattern as the ticket-level IDOR mitigation
    // (VULN-004): user B gets 404, not 403 and not the file bytes.
    await request(app)
      .get(`/tickets/${ticketId}/attachments/${stored.id}/download`)
      .set('Cookie', `token=${tokenB}`)
      .expect(404);

    // Owner can still download it fine — proves the attachment itself was untouched.
    await request(app)
      .get(`/tickets/${ticketId}/attachments/${stored.id}/download`)
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
  });

  test('rejects an oversized file (over the 5 MB cap)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);
    const ticketId = await createTicketAs(app, tokenA, 'e2e_attachment_ticket_oversized');
    const { csrf, csrfCookie } = await getUploadCsrf(app, tokenA, ticketId);

    const oversized = Buffer.concat([PNG_MAGIC, Buffer.alloc(5 * 1024 * 1024 + 1)]);

    await request(app)
      .post(`/tickets/${ticketId}/attachments`)
      .set('Cookie', [`token=${tokenA}`, csrfCookie].join('; '))
      .field('_csrf', csrf)
      .attach('attachment', oversized, 'huge.png')
      .expect(400);

    const stored = await db('attachments').where({ ticket_id: ticketId }).first();
    assert.equal(stored, undefined, 'no attachment row must have been persisted for an oversized upload');
  });

  test('rejects unauthenticated access to upload and download routes', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await request(app).post('/tickets/1/attachments').expect(401);
    await request(app).get('/tickets/1/attachments/1/download').expect(401);
  });
});
