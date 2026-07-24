const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

const { AssetsService } = require('../../../src/modules/assets/service');
const { AppError } = require('../../../src/core/errors/AppError');

function buildRepositoryStub(overrides = {}) {
  return {
    list: mock.fn(async () => []),
    listUsersForForm: mock.fn(async () => []),
    listTicketsForAsset: mock.fn(async () => []),
    findById: mock.fn(async () => null),
    create: mock.fn(async () => 1),
    update: mock.fn(async (id, fields) => ({ id, ...fields })),
    delete: mock.fn(async () => 1),
    ...overrides,
  };
}

const CREATOR = { id: 7, role: 'agent' };
const ASSET = { id: 42, name: 'srv-01', created_by_user_id: CREATOR.id };

describe('AssetsService.create', () => {
  test('persists the asset with the authenticated createdByUserId, never from client input', async () => {
    const repository = buildRepositoryStub({
      create: mock.fn(async () => 9),
      findById: mock.fn(async (id) => ({ id, created_by_user_id: CREATOR.id })),
    });
    const service = new AssetsService(repository);

    await service.create({ name: 'srv-01', assetType: 'server' }, CREATOR.id);

    assert.equal(repository.create.mock.callCount(), 1);
    const [persisted] = repository.create.mock.calls[0].arguments;
    assert.equal(persisted.createdByUserId, CREATOR.id);
  });
});

// Assets are shared IT inventory, not per-user resources: v1
// (v1-inseguro/src/modules/assets/routes.js) lists ALL assets to any
// authenticated user and looks up any asset by id with zero ownership
// check on view/edit/delete — its `[VULN-004][A01:IDOR]` markers there flag
// the *unvalidated raw id concatenated into SQL* (fixed here via Knex bound
// parameters + integer id parsing), not a missing per-user visibility
// restriction. Unlike tickets (which DO have a real per-requester ownership
// concept enforced in tickets/service.js), there is no equivalent concept
// for assets to enforce here — any authenticated user may view/edit/delete
// any asset, matching v1's actual (shared-inventory) behavior.
describe('AssetsService — no per-user ownership restriction (shared inventory, confirmed from v1)', () => {
  test('findOrFail() returns the asset for any authenticated user role', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => ASSET) });
    const service = new AssetsService(repository);

    const plainUser = { id: 999, role: 'user' };
    const result = await service.findOrFail(ASSET.id, plainUser);
    assert.deepEqual(result, ASSET);
  });

  test('findOrFail() throws a generic 404 when the asset does not exist', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => null) });
    const service = new AssetsService(repository);

    await assert.rejects(
      () => service.findOrFail(999, { id: 1, role: 'user' }),
      (error) => error instanceof AppError && error.statusCode === 404
    );
  });

  test('update() succeeds for a plain user who did not create the asset', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => ASSET) });
    const service = new AssetsService(repository);

    const otherUser = { id: 999, role: 'user' };
    await service.update(ASSET.id, otherUser, { name: 'renamed', assetType: 'server' });
    assert.equal(repository.update.mock.callCount(), 1);
  });

  test('remove() succeeds for a plain user who did not create the asset', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => ASSET) });
    const service = new AssetsService(repository);

    const otherUser = { id: 999, role: 'user' };
    await service.remove(ASSET.id, otherUser);
    assert.equal(repository.delete.mock.callCount(), 1);
  });

  test('update() throws 404 (not found) when the asset id does not exist, regardless of role', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => null) });
    const service = new AssetsService(repository);

    await assert.rejects(
      () => service.update(999, { id: 1, role: 'admin' }, { name: 'x', assetType: 'server' }),
      (error) => error instanceof AppError && error.statusCode === 404
    );
  });
});
