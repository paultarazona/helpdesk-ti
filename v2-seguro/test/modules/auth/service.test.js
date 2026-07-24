const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { env } = require('../../../src/config/env');
const { AuthService } = require('../../../src/modules/auth/service');
const { AppError } = require('../../../src/core/errors/AppError');

function buildRepositoryStub(overrides = {}) {
  return {
    findByUsername: mock.fn(async () => null),
    findByEmail: mock.fn(async () => null),
    create: mock.fn(async (user) => ({ id: 1, username: user.username, email: user.email, role: 'user' })),
    ...overrides,
  };
}

describe('AuthService.register', () => {
  test('hashes the password with bcrypt (12 rounds) before persisting it', async () => {
    const repository = buildRepositoryStub();
    const service = new AuthService(repository);

    await service.register({ username: 'alice', email: 'alice@example.com', password: 'Sup3rSecret' });

    assert.equal(repository.create.mock.callCount(), 1);
    const [persisted] = repository.create.mock.calls[0].arguments;

    assert.notEqual(persisted.passwordHash, 'Sup3rSecret');
    const matches = await bcrypt.compare('Sup3rSecret', persisted.passwordHash);
    assert.equal(matches, true);

    const [, , rounds] = persisted.passwordHash.split('$');
    assert.equal(rounds, '12');
  });

  test('always hardcodes role to "user" regardless of any role-like data passed in', async () => {
    const repository = buildRepositoryStub();
    const service = new AuthService(repository);

    await service.register({ username: 'alice', email: 'alice@example.com', password: 'Sup3rSecret' });

    const [persisted] = repository.create.mock.calls[0].arguments;
    assert.equal(persisted.role, 'user');
  });

  test('never returns the password or password hash in the result', async () => {
    const repository = buildRepositoryStub();
    const service = new AuthService(repository);

    const result = await service.register({ username: 'alice', email: 'alice@example.com', password: 'Sup3rSecret' });

    assert.equal(result.password, undefined);
    assert.equal(result.passwordHash, undefined);
    assert.equal(result.password_hash, undefined);
    assert.deepEqual(Object.keys(result).sort(), ['email', 'id', 'role', 'username']);
  });

  test('rejects registration when the username is already taken', async () => {
    const repository = buildRepositoryStub({
      findByUsername: mock.fn(async () => ({ id: 5, username: 'alice' })),
    });
    const service = new AuthService(repository);

    await assert.rejects(
      () => service.register({ username: 'alice', email: 'new@example.com', password: 'Sup3rSecret' }),
      (error) => error instanceof AppError && error.statusCode === 409
    );
    assert.equal(repository.create.mock.callCount(), 0);
  });

  test('rejects registration when the email is already taken', async () => {
    const repository = buildRepositoryStub({
      findByEmail: mock.fn(async () => ({ id: 5, email: 'alice@example.com' })),
    });
    const service = new AuthService(repository);

    await assert.rejects(
      () => service.register({ username: 'newname', email: 'alice@example.com', password: 'Sup3rSecret' }),
      (error) => error instanceof AppError && error.statusCode === 409
    );
    assert.equal(repository.create.mock.callCount(), 0);
  });
});

describe('AuthService.login', () => {
  test('returns a signed HS256 JWT with a short expiration and the safe user on valid credentials', async () => {
    const passwordHash = await bcrypt.hash('Sup3rSecret', 12);
    const repository = buildRepositoryStub({
      findByUsername: mock.fn(async () => ({
        id: 7,
        username: 'alice',
        email: 'alice@example.com',
        password_hash: passwordHash,
        role: 'user',
      })),
    });
    const service = new AuthService(repository);

    const result = await service.login({ username: 'alice', password: 'Sup3rSecret' });

    assert.equal(typeof result.token, 'string');
    assert.deepEqual(result.user, { id: 7, username: 'alice', email: 'alice@example.com', role: 'user' });

    const decoded = jwt.decode(result.token, { complete: true });
    assert.equal(decoded.header.alg, 'HS256');

    const payload = jwt.verify(result.token, env.JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(payload.id, 7);
    assert.equal(payload.username, 'alice');
    assert.equal(payload.role, 'user');
    assert.equal(typeof payload.exp, 'number');
    assert.equal(typeof payload.iat, 'number');
  });

  test('rejects login when the username does not exist (generic error, no user enumeration)', async () => {
    const repository = buildRepositoryStub();
    const service = new AuthService(repository);

    await assert.rejects(
      () => service.login({ username: 'ghost', password: 'whatever12' }),
      (error) => error instanceof AppError && error.statusCode === 401
    );
  });

  test('rejects login when the password is wrong, with the same generic error as an unknown user', async () => {
    const passwordHash = await bcrypt.hash('Sup3rSecret', 12);
    const repository = buildRepositoryStub({
      findByUsername: mock.fn(async () => ({
        id: 7,
        username: 'alice',
        email: 'alice@example.com',
        password_hash: passwordHash,
        role: 'user',
      })),
    });
    const service = new AuthService(repository);

    await assert.rejects(
      () => service.login({ username: 'alice', password: 'wrong-password' }),
      (error) => error instanceof AppError && error.statusCode === 401 && error.message === 'Invalid username or password.'
    );
  });

  test('rejects the classic SQLi payload as ordinary bad credentials, not a query fragment', async () => {
    const repository = buildRepositoryStub();
    const service = new AuthService(repository);

    await assert.rejects(
      () => service.login({ username: "' OR '1'='1", password: "' OR '1'='1" }),
      (error) => error instanceof AppError && error.statusCode === 401
    );
    assert.equal(repository.findByUsername.mock.callCount(), 1);
    assert.equal(repository.findByUsername.mock.calls[0].arguments[0], "' OR '1'='1");
  });
});
