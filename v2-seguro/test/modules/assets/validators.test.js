const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createAssetSchema,
  updateAssetSchema,
  assetQuerySchema,
  ASSET_TYPES,
} = require('../../../src/modules/assets/validators');

describe('assets validators - createAssetSchema', () => {
  test('accepts a valid minimal payload (name + assetType only)', () => {
    const result = createAssetSchema.safeParse({ name: 'srv-01', assetType: 'server' });

    assert.equal(result.success, true);
    assert.equal(result.data.name, 'srv-01');
    assert.equal(result.data.assetType, 'server');
    assert.equal(result.data.ipAddress, undefined);
    assert.equal(result.data.assignedToUserId, undefined);
  });

  test('accepts a full payload with IPv4 address and assignedToUserId', () => {
    const result = createAssetSchema.safeParse({
      name: 'laptop-mkt-03',
      assetType: 'laptop',
      ipAddress: '192.168.1.42',
      assignedToUserId: '5',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.ipAddress, '192.168.1.42');
    assert.equal(result.data.assignedToUserId, 5);
  });

  test('accepts a valid IPv6 address', () => {
    const result = createAssetSchema.safeParse({
      name: 'switch-core',
      assetType: 'switch',
      ipAddress: '2001:db8::1',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.ipAddress, '2001:db8::1');
  });

  test('treats an empty-string ipAddress (the "no IP" form option) as undefined', () => {
    const result = createAssetSchema.safeParse({ name: 'printer-01', assetType: 'printer', ipAddress: '' });

    assert.equal(result.success, true);
    assert.equal(result.data.ipAddress, undefined);
  });

  test('treats an empty-string assignedToUserId (the "unassigned" form option) as undefined', () => {
    const result = createAssetSchema.safeParse({
      name: 'router-edge',
      assetType: 'router',
      assignedToUserId: '',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.assignedToUserId, undefined);
  });

  test('rejects an invalid IP address format', () => {
    const result = createAssetSchema.safeParse({
      name: 'srv-02',
      assetType: 'server',
      ipAddress: 'not-an-ip',
    });

    assert.equal(result.success, false);
  });

  test('rejects a SQLi-shaped string used as an IP address (fails IP shape validation, not because it looks malicious)', () => {
    const result = createAssetSchema.safeParse({
      name: 'srv-03',
      assetType: 'server',
      ipAddress: "'; DROP TABLE assets;--",
    });

    assert.equal(result.success, false);
  });

  test('rejects an empty name', () => {
    const result = createAssetSchema.safeParse({ name: '', assetType: 'server' });
    assert.equal(result.success, false);
  });

  test('rejects a name longer than 120 characters (matches migrations/002_create_assets.js column width)', () => {
    const result = createAssetSchema.safeParse({ name: 'a'.repeat(121), assetType: 'server' });
    assert.equal(result.success, false);
  });

  test('rejects an asset type outside the fixed domain (server/laptop/switch/router/printer)', () => {
    const result = createAssetSchema.safeParse({ name: 'mystery-box', assetType: 'tablet' });
    assert.equal(result.success, false);
  });

  test('rejects a missing assetType', () => {
    const result = createAssetSchema.safeParse({ name: 'srv-04' });
    assert.equal(result.success, false);
  });

  test('exposes the exact asset type domain from the migration (server, laptop, switch, router, printer)', () => {
    assert.deepEqual([...ASSET_TYPES].sort(), ['laptop', 'printer', 'router', 'server', 'switch']);
  });

  test('rejects a payload that attempts to smuggle a createdByUserId (strict schema, never trusted from the client)', () => {
    const result = createAssetSchema.safeParse({
      name: 'srv-05',
      assetType: 'server',
      createdByUserId: 999,
    });

    assert.equal(result.success, false);
  });
});

describe('assets validators - updateAssetSchema', () => {
  test('accepts a full valid update payload', () => {
    const result = updateAssetSchema.safeParse({
      name: 'srv-01-renamed',
      assetType: 'server',
      ipAddress: '',
      assignedToUserId: '',
    });

    assert.equal(result.success, true);
  });

  test('rejects a missing assetType (no default on update)', () => {
    const result = updateAssetSchema.safeParse({ name: 'srv-01-renamed' });
    assert.equal(result.success, false);
  });
});

describe('assets validators - assetQuerySchema (search by name/IP)', () => {
  test('defaults search to an empty string when the query string is empty', () => {
    const result = assetQuerySchema.safeParse({});

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { search: '' });
  });

  test('accepts a normal search string', () => {
    const result = assetQuerySchema.safeParse({ search: '192.168.1' });

    assert.equal(result.success, true);
    assert.equal(result.data.search, '192.168.1');
  });

  test('accepts a classic SQLi-shaped search string as ordinary text (not rejected here — mitigation lives in the repository)', () => {
    const result = assetQuerySchema.safeParse({ search: "'; DROP TABLE assets;--" });

    assert.equal(result.success, true);
    assert.equal(result.data.search, "'; DROP TABLE assets;--");
  });

  test('accepts the classic boolean-based payload as ordinary text', () => {
    const result = assetQuerySchema.safeParse({ search: "' OR '1'='1" });

    assert.equal(result.success, true);
  });

  test('rejects a search string longer than 200 characters', () => {
    const result = assetQuerySchema.safeParse({ search: 'a'.repeat(201) });
    assert.equal(result.success, false);
  });
});
