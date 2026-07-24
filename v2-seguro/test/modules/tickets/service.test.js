const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

const { TicketsService } = require('../../../src/modules/tickets/service');
const { AppError } = require('../../../src/core/errors/AppError');

function buildRepositoryStub(overrides = {}) {
  return {
    list: mock.fn(async () => []),
    listAssetsForForm: mock.fn(async () => []),
    findById: mock.fn(async () => null),
    create: mock.fn(async () => 1),
    update: mock.fn(async (id, fields) => ({ id, ...fields })),
    delete: mock.fn(async () => 1),
    ...overrides,
  };
}

const OWNER = { id: 1, role: 'user' };
const OTHER_USER = { id: 2, role: 'user' };
const AGENT = { id: 99, role: 'agent' };
const ADMIN = { id: 100, role: 'admin' };

const TICKET = { id: 42, requester_id: OWNER.id, subject: 'Broken keyboard' };

describe('TicketsService.create', () => {
  test('persists the ticket with the authenticated requesterId, never from client input', async () => {
    const repository = buildRepositoryStub({
      create: mock.fn(async () => 7),
      findById: mock.fn(async (id) => ({ id, requester_id: OWNER.id })),
    });
    const service = new TicketsService(repository);

    await service.create({ subject: 'New ticket', description: 'desc' }, OWNER.id);

    assert.equal(repository.create.mock.callCount(), 1);
    const [persisted] = repository.create.mock.calls[0].arguments;
    assert.equal(persisted.requesterId, OWNER.id);
  });
});

describe('TicketsService IDOR mitigation (VULN-004)', () => {
  test('canAccess() returns true for the owning user', () => {
    const service = new TicketsService(buildRepositoryStub());
    assert.equal(service.canAccess(TICKET, OWNER), true);
  });

  test('canAccess() returns false for a different plain user', () => {
    const service = new TicketsService(buildRepositoryStub());
    assert.equal(service.canAccess(TICKET, OTHER_USER), false);
  });

  test('canAccess() returns true for an agent regardless of ownership', () => {
    const service = new TicketsService(buildRepositoryStub());
    assert.equal(service.canAccess(TICKET, AGENT), true);
  });

  test('canAccess() returns true for an admin regardless of ownership', () => {
    const service = new TicketsService(buildRepositoryStub());
    assert.equal(service.canAccess(TICKET, ADMIN), true);
  });

  test('canAccess() returns false for a null ticket (does not exist)', () => {
    const service = new TicketsService(buildRepositoryStub());
    assert.equal(service.canAccess(null, OWNER), false);
  });

  test('getOwnedTicket() throws a 404 (not 403) when the ticket does not exist', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => null) });
    const service = new TicketsService(repository);

    await assert.rejects(
      () => service.getOwnedTicket(999, OWNER),
      (error) => error instanceof AppError && error.statusCode === 404
    );
  });

  test('getOwnedTicket() throws the SAME 404 when the ticket exists but belongs to someone else', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    await assert.rejects(
      () => service.getOwnedTicket(TICKET.id, OTHER_USER),
      (error) => error instanceof AppError && error.statusCode === 404 && error.message === 'Ticket not found.'
    );
  });

  test('getOwnedTicket() resolves for the owning user', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    const result = await service.getOwnedTicket(TICKET.id, OWNER);
    assert.deepEqual(result, TICKET);
  });

  test('getOwnedTicket() resolves for an agent viewing someone else\'s ticket', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    const result = await service.getOwnedTicket(TICKET.id, AGENT);
    assert.deepEqual(result, TICKET);
  });

  test('update() rejects (404) when a non-owner tries to edit', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    await assert.rejects(
      () => service.update(TICKET.id, OTHER_USER, { subject: 'Hijacked' }),
      (error) => error instanceof AppError && error.statusCode === 404
    );
    assert.equal(repository.update.mock.callCount(), 0);
  });

  test('remove() rejects (404) when a non-owner tries to delete', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    await assert.rejects(
      () => service.remove(TICKET.id, OTHER_USER),
      (error) => error instanceof AppError && error.statusCode === 404
    );
    assert.equal(repository.delete.mock.callCount(), 0);
  });

  test('close() rejects (404) when a non-owner tries to close', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    await assert.rejects(
      () => service.close(TICKET.id, OTHER_USER),
      (error) => error instanceof AppError && error.statusCode === 404
    );
  });

  test('update() succeeds for the owner', async () => {
    const repository = buildRepositoryStub({ findById: mock.fn(async () => TICKET) });
    const service = new TicketsService(repository);

    await service.update(TICKET.id, OWNER, { subject: 'Edited by owner' });
    assert.equal(repository.update.mock.callCount(), 1);
  });
});
