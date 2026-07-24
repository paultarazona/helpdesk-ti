const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createCommentSchema } = require('../../../src/modules/comments/validators');

describe('comments validators - createCommentSchema', () => {
  test('accepts a normal comment body', () => {
    const result = createCommentSchema.safeParse({ body: 'The VPN reconnect worked.' });

    assert.equal(result.success, true);
    assert.equal(result.data.body, 'The VPN reconnect worked.');
  });

  test('trims surrounding whitespace', () => {
    const result = createCommentSchema.safeParse({ body: '   padded   ' });

    assert.equal(result.success, true);
    assert.equal(result.data.body, 'padded');
  });

  test('rejects an empty body', () => {
    const result = createCommentSchema.safeParse({ body: '' });
    assert.equal(result.success, false);
  });

  test('rejects a body that is only whitespace', () => {
    const result = createCommentSchema.safeParse({ body: '   ' });
    assert.equal(result.success, false);
  });

  test('rejects a missing body', () => {
    const result = createCommentSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test('rejects a body longer than 2000 characters', () => {
    const result = createCommentSchema.safeParse({ body: 'a'.repeat(2001) });
    assert.equal(result.success, false);
  });

  test('accepts a body at exactly the 2000 character limit', () => {
    const result = createCommentSchema.safeParse({ body: 'a'.repeat(2000) });
    assert.equal(result.success, true);
  });

  test('rejects a payload that attempts to smuggle authorId/ticketId (strict schema, authorship can never come from the client)', () => {
    const result = createCommentSchema.safeParse({ body: 'hello', authorId: 999, ticketId: 1 });
    assert.equal(result.success, false);
  });

  test('does not reject HTML/script-shaped content — sanitization is the service layer\'s job, not the validator\'s', () => {
    const result = createCommentSchema.safeParse({ body: '<script>alert(1)</script>' });
    assert.equal(result.success, true);
  });
});
