const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { registerSchema, loginSchema } = require('../../../src/modules/auth/validators');

describe('auth validators - registerSchema', () => {
  test('accepts a valid registration payload', () => {
    const result = registerSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Sup3rSecret',
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      username: 'alice',
      email: 'alice@example.com',
      password: 'Sup3rSecret',
    });
  });

  test('rejects a missing username', () => {
    const result = registerSchema.safeParse({
      email: 'alice@example.com',
      password: 'Sup3rSecret',
    });

    assert.equal(result.success, false);
  });

  test('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      username: 'alice',
      email: 'not-an-email',
      password: 'Sup3rSecret',
    });

    assert.equal(result.success, false);
  });

  test('rejects a password shorter than 10 characters', () => {
    const result = registerSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Ab3short',
    });

    assert.equal(result.success, false);
  });

  test('rejects a password with no digit', () => {
    const result = registerSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: 'NoDigitsHere',
    });

    assert.equal(result.success, false);
  });

  test('rejects a password with no letter', () => {
    const result = registerSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: '1234567890',
    });

    assert.equal(result.success, false);
  });

  test('rejects a payload that attempts to set role from client input (strict schema)', () => {
    const result = registerSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Sup3rSecret',
      role: 'admin',
    });

    assert.equal(result.success, false);
  });
});

describe('auth validators - loginSchema', () => {
  test('accepts a valid login payload', () => {
    const result = loginSchema.safeParse({ username: 'alice', password: 'whatever-they-typed' });

    assert.equal(result.success, true);
  });

  test('rejects a missing password', () => {
    const result = loginSchema.safeParse({ username: 'alice' });

    assert.equal(result.success, false);
  });

  test('rejects a missing username', () => {
    const result = loginSchema.safeParse({ password: 'whatever-they-typed' });

    assert.equal(result.success, false);
  });

  test('does not enforce the registration password policy on login (so existing weak passwords can still authenticate)', () => {
    const result = loginSchema.safeParse({ username: 'alice', password: 'short' });

    assert.equal(result.success, true);
  });
});
