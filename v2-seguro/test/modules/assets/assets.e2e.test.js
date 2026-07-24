const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { env } = require('../../../src/config/env');

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

describe('assets e2e (supertest against the real app, real Postgres)', () => {
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
        `[assets.e2e.test.js] Postgres not reachable at ${env.DB_HOST}:${env.DB_PORT} — ` +
          'skipping assets e2e tests. Provision a test database and run ' +
          '`npx knex migrate:latest --env test` to enable them.'
      );
      return;
    }

    app = require('../../../src/app');
    ({ db, closeConnection } = require('../../../src/db/connection'));

    try {
      await db.migrate.latest();
    } catch (error) {
      console.log(`[assets.e2e.test.js] Could not prepare the test DB: ${error.message}`);
      dbAvailable = false;
      return;
    }

    await db('assets').whereIn('name', ['e2e_asset_crud', 'e2e_asset_shared']).del();
    await db('users').whereIn('username', ['e2e_asset_user_a', 'e2e_asset_user_b']).del();

    [{ id: userAId }] = await db('users')
      .insert({
        username: 'e2e_asset_user_a',
        email: 'e2e_asset_user_a@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userA = { id: userAId, username: 'e2e_asset_user_a', role: 'user' };

    [{ id: userBId }] = await db('users')
      .insert({
        username: 'e2e_asset_user_b',
        email: 'e2e_asset_user_b@example.com',
        password_hash: 'not-a-real-hash',
        role: 'user',
      })
      .returning('id');
    userB = { id: userBId, username: 'e2e_asset_user_b', role: 'user' };
  });

  after(async () => {
    if (dbAvailable && db) {
      await db('assets').whereIn('created_by_user_id', [userA.id, userB.id]).del();
      await db('users').whereIn('username', ['e2e_asset_user_a', 'e2e_asset_user_b']).del();
      await closeConnection();
    }
  });

  test('rejects unauthenticated access to any asset route', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    await request(app).get('/assets').expect(401);
    await request(app).get('/assets/new').expect(401);
  });

  test(
    'shared inventory: a plain user can view/edit/delete an asset created by a different plain user (no ownership restriction — confirmed from v1)',
    async (t) => {
      if (!dbAvailable) {
        t.skip('no reachable test Postgres database');
        return;
      }

      const tokenA = signToken(userA);

      const newFormGet = await request(app).get('/assets/new').set('Cookie', `token=${tokenA}`).expect(200);
      const createCsrf = extractCsrf(newFormGet.text);
      const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

      const createResponse = await request(app)
        .post('/assets')
        .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
        .type('form')
        .send({ name: 'e2e_asset_shared', assetType: 'server', _csrf: createCsrf })
        .expect(302);

      const assetId = createResponse.headers.location.split('/').pop();

      const tokenB = signToken(userB);

      // View — allowed, not a 404, since assets are shared inventory.
      await request(app).get(`/assets/${assetId}`).set('Cookie', `token=${tokenB}`).expect(200);

      // Edit form — allowed.
      const editFormGetAsB = await request(app)
        .get(`/assets/${assetId}/edit`)
        .set('Cookie', `token=${tokenB}`)
        .expect(200);
      const editCsrf = extractCsrf(editFormGetAsB.text);
      const editCsrfCookie = extractCookie(editFormGetAsB.headers['set-cookie'], 'x-csrf-token');

      // Edit submit — allowed.
      await request(app)
        .post(`/assets/${assetId}`)
        .set('Cookie', [`token=${tokenB}`, editCsrfCookie].join('; '))
        .type('form')
        .send({ name: 'e2e_asset_shared_renamed', assetType: 'server', _csrf: editCsrf })
        .expect(302);

      const afterEdit = await db('assets').where({ id: assetId }).first();
      assert.equal(afterEdit.name, 'e2e_asset_shared_renamed');

      // Delete — allowed.
      await request(app)
        .post(`/assets/${assetId}/delete`)
        .set('Cookie', [`token=${tokenB}`, editCsrfCookie].join('; '))
        .type('form')
        .send({ _csrf: editCsrf })
        .expect(302);

      const afterDelete = await db('assets').where({ id: assetId }).first();
      assert.equal(afterDelete, undefined);
    }
  );

  test('full happy-path CRUD: create -> list/search -> view -> edit -> delete', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);

    const newFormGet = await request(app).get('/assets/new').set('Cookie', `token=${tokenA}`).expect(200);
    const createCsrf = extractCsrf(newFormGet.text);
    const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

    const createResponse = await request(app)
      .post('/assets')
      .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
      .type('form')
      .send({
        name: 'e2e_asset_crud',
        assetType: 'laptop',
        ipAddress: '10.20.30.40',
        _csrf: createCsrf,
      })
      .expect(302);

    const assetId = createResponse.headers.location.split('/').pop();
    assert.equal(createResponse.headers.location, `/assets/${assetId}`);

    // List — plain
    const listResponse = await request(app).get('/assets').set('Cookie', `token=${tokenA}`).expect(200);
    assert.ok(listResponse.text.includes('e2e_asset_crud'));

    // List — search by name finds it
    const searchByNameResponse = await request(app)
      .get('/assets')
      .query({ search: 'e2e_asset_crud' })
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    assert.ok(searchByNameResponse.text.includes('e2e_asset_crud'));

    // List — search by IP finds it
    const searchByIpResponse = await request(app)
      .get('/assets')
      .query({ search: '10.20.30.40' })
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    assert.ok(searchByIpResponse.text.includes('e2e_asset_crud'));

    // List — search that excludes it
    const excludedResponse = await request(app)
      .get('/assets')
      .query({ search: 'no_such_asset_exists_xyz' })
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    assert.equal(excludedResponse.text.includes('e2e_asset_crud'), false);

    // View detail
    const showResponse = await request(app).get(`/assets/${assetId}`).set('Cookie', `token=${tokenA}`).expect(200);
    assert.ok(showResponse.text.includes('10.20.30.40'));

    // Edit
    const editFormGet = await request(app)
      .get(`/assets/${assetId}/edit`)
      .set('Cookie', `token=${tokenA}`)
      .expect(200);
    const editCsrf = extractCsrf(editFormGet.text);
    const editCsrfCookie = extractCookie(editFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/assets/${assetId}`)
      .set('Cookie', [`token=${tokenA}`, editCsrfCookie].join('; '))
      .type('form')
      .send({
        name: 'e2e_asset_crud',
        assetType: 'laptop',
        ipAddress: '10.20.30.41',
        _csrf: editCsrf,
      })
      .expect(302);

    const afterEdit = await db('assets').where({ id: assetId }).first();
    assert.equal(afterEdit.ip_address, '10.20.30.41');

    // Delete
    const deleteFormGet = await request(app).get(`/assets/${assetId}`).set('Cookie', `token=${tokenA}`).expect(200);
    const deleteCsrf = extractCsrf(deleteFormGet.text);
    const deleteCsrfCookie = extractCookie(deleteFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post(`/assets/${assetId}/delete`)
      .set('Cookie', [`token=${tokenA}`, deleteCsrfCookie].join('; '))
      .type('form')
      .send({ _csrf: deleteCsrf })
      .expect(302);

    const afterDelete = await db('assets').where({ id: assetId }).first();
    assert.equal(afterDelete, undefined);
  });

  test('rejects a create submission with an invalid payload (asset type outside the fixed domain)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);

    const newFormGet = await request(app).get('/assets/new').set('Cookie', `token=${tokenA}`).expect(200);
    const createCsrf = extractCsrf(newFormGet.text);
    const createCsrfCookie = extractCookie(newFormGet.headers['set-cookie'], 'x-csrf-token');

    await request(app)
      .post('/assets')
      .set('Cookie', [`token=${tokenA}`, createCsrfCookie].join('; '))
      .type('form')
      .send({ name: 'bad-type-asset', assetType: 'tablet', _csrf: createCsrf })
      .expect(400);
  });

  test('IDOR-adjacent: a malformed id (e.g. "1 OR 1=1") on GET /assets/:id returns a generic 404, never a 500 or SQL error (proves VULN-001/VULN-004 mitigation)', async (t) => {
    if (!dbAvailable) {
      t.skip('no reachable test Postgres database');
      return;
    }

    const tokenA = signToken(userA);

    await request(app)
      .get('/assets/1%20OR%201%3D1')
      .set('Cookie', `token=${tokenA}`)
      .expect(404);

    await request(app).get('/assets/999999999').set('Cookie', `token=${tokenA}`).expect(404);
  });
});
