const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

const { CommentsService, sanitize } = require('../../../src/modules/comments/service');
const { AppError } = require('../../../src/core/errors/AppError');

function buildRepositoryStub(overrides = {}) {
  return {
    listByTicketId: mock.fn(async () => []),
    findById: mock.fn(async (id) => ({ id, body: 'sanitized body', author_username: 'alice' })),
    create: mock.fn(async () => 1),
    ...overrides,
  };
}

function buildTicketsServiceStub(overrides = {}) {
  return {
    getOwnedTicket: mock.fn(async () => ({ id: 1, requester_id: 1 })),
    ...overrides,
  };
}

const OWNER = { id: 1, role: 'user' };
const OTHER_USER = { id: 2, role: 'user' };
const TICKET_ID = 42;

describe('sanitize()', () => {
  test('strips a <script> tag and its content entirely', () => {
    assert.equal(sanitize('hello <script>alert(1)</script> world'), 'hello  world');
  });

  test('strips an <img onerror> tag', () => {
    assert.equal(sanitize('look: <img src=x onerror=alert(1)> done'), 'look:  done');
  });

  test('leaves plain text untouched', () => {
    assert.equal(sanitize('The VPN reconnect worked.'), 'The VPN reconnect worked.');
  });
});

describe('CommentsService.create', () => {
  test('rejects (404) when the user does not own the ticket', async () => {
    const ticketsService = buildTicketsServiceStub({
      getOwnedTicket: mock.fn(async () => {
        throw new AppError('Ticket not found.', 404);
      }),
    });
    const repository = buildRepositoryStub();
    const service = new CommentsService(repository, ticketsService);

    await assert.rejects(
      () => service.create(TICKET_ID, OTHER_USER, { body: 'Hijacked comment' }),
      (error) => error instanceof AppError && error.statusCode === 404
    );
    assert.equal(repository.create.mock.callCount(), 0);
  });

  test('sanitizes the body before persisting it', async () => {
    const ticketsService = buildTicketsServiceStub();
    const repository = buildRepositoryStub();
    const service = new CommentsService(repository, ticketsService);

    await service.create(TICKET_ID, OWNER, { body: 'hi <script>alert(1)</script>' });

    assert.equal(repository.create.mock.callCount(), 1);
    const [persisted] = repository.create.mock.calls[0].arguments;
    assert.equal(persisted.body, 'hi ');
    assert.equal(persisted.ticketId, TICKET_ID);
    assert.equal(persisted.authorId, OWNER.id);
  });

  test('uses the authenticated user id as authorId, never from client input', async () => {
    const ticketsService = buildTicketsServiceStub();
    const repository = buildRepositoryStub();
    const service = new CommentsService(repository, ticketsService);

    await service.create(TICKET_ID, OWNER, { body: 'A normal comment', authorId: 999 });

    const [persisted] = repository.create.mock.calls[0].arguments;
    assert.equal(persisted.authorId, OWNER.id);
  });
});

describe('CommentsService.listForTicket', () => {
  test('rejects (404) when the user does not own the ticket', async () => {
    const ticketsService = buildTicketsServiceStub({
      getOwnedTicket: mock.fn(async () => {
        throw new AppError('Ticket not found.', 404);
      }),
    });
    const repository = buildRepositoryStub();
    const service = new CommentsService(repository, ticketsService);

    await assert.rejects(
      () => service.listForTicket(TICKET_ID, OTHER_USER),
      (error) => error instanceof AppError && error.statusCode === 404
    );
    assert.equal(repository.listByTicketId.mock.callCount(), 0);
  });

  test('returns the comments for the owner', async () => {
    const ticketsService = buildTicketsServiceStub();
    const repository = buildRepositoryStub({
      listByTicketId: mock.fn(async () => [{ id: 1, body: 'hello', author_username: 'alice' }]),
    });
    const service = new CommentsService(repository, ticketsService);

    const result = await service.listForTicket(TICKET_ID, OWNER);
    assert.equal(result.length, 1);
    assert.equal(repository.listByTicketId.mock.callCount(), 1);
  });
});
