const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { pingSchema, healthCheckSchema } = require('../../../src/modules/diagnostics/validators');

describe('diagnostics validators - pingSchema (mitigates VULN-007 command injection)', () => {
  test('accepts a valid IPv4 address', () => {
    const result = pingSchema.safeParse({ target: '192.168.1.10' });

    assert.equal(result.success, true);
    assert.equal(result.data.target, '192.168.1.10');
  });

  test('accepts loopback (127.0.0.1) — ping itself is not the SSRF surface, only health-check is', () => {
    const result = pingSchema.safeParse({ target: '127.0.0.1' });
    assert.equal(result.success, true);
  });

  test('rejects the classic command-injection payload (semicolon + second command)', () => {
    const result = pingSchema.safeParse({ target: '8.8.8.8; cat /etc/passwd' });
    assert.equal(result.success, false);
  });

  test('rejects a command-substitution payload ($(whoami))', () => {
    const result = pingSchema.safeParse({ target: '8.8.8.8$(whoami)' });
    assert.equal(result.success, false);
  });

  test('rejects a backtick command-substitution payload', () => {
    const result = pingSchema.safeParse({ target: '8.8.8.8`whoami`' });
    assert.equal(result.success, false);
  });

  test('rejects a pipe-chained payload', () => {
    const result = pingSchema.safeParse({ target: '8.8.8.8 | cat /etc/passwd' });
    assert.equal(result.success, false);
  });

  test('rejects an ampersand-chained payload', () => {
    const result = pingSchema.safeParse({ target: '8.8.8.8 & whoami' });
    assert.equal(result.success, false);
  });

  test('rejects a hostname (only strict IPv4 is accepted)', () => {
    const result = pingSchema.safeParse({ target: 'example.com' });
    assert.equal(result.success, false);
  });

  test('rejects an empty target', () => {
    const result = pingSchema.safeParse({ target: '' });
    assert.equal(result.success, false);
  });

  test('rejects a payload smuggling extra fields (strict schema)', () => {
    const result = pingSchema.safeParse({ target: '8.8.8.8', extra: 'ignored' });
    assert.equal(result.success, false);
  });
});

describe('diagnostics validators - healthCheckSchema (mitigates VULN-008 SSRF)', () => {
  test('accepts a well-formed https URL', () => {
    const result = healthCheckSchema.safeParse({ url: 'https://example.com/health' });
    assert.equal(result.success, true);
  });

  test('accepts a well-formed http URL', () => {
    const result = healthCheckSchema.safeParse({ url: 'http://example.com/health' });
    assert.equal(result.success, true);
  });

  test('rejects a non-URL string', () => {
    const result = healthCheckSchema.safeParse({ url: 'not a url' });
    assert.equal(result.success, false);
  });

  test('rejects a non-http(s) scheme (file://)', () => {
    const result = healthCheckSchema.safeParse({ url: 'file:///etc/passwd' });
    assert.equal(result.success, false);
  });

  test('rejects a non-http(s) scheme (gopher://)', () => {
    const result = healthCheckSchema.safeParse({ url: 'gopher://example.com/health' });
    assert.equal(result.success, false);
  });

  // NOTE: this schema is shape-only by design (see validators.js comment).
  // It does NOT reject http://169.254.169.254/, http://127.0.0.1/, or
  // http://localhost/ — those are well-formed URLs. The real allow/deny
  // decision runs in service.js at request time (tested in service.test.js
  // and diagnostics.e2e.test.js), because it depends on DNS resolution.
  test('accepts (at the shape level) a URL pointing at the metadata endpoint — the block happens in service.js, not here', () => {
    const result = healthCheckSchema.safeParse({ url: 'http://169.254.169.254/' });
    assert.equal(result.success, true);
  });

  test('rejects a payload smuggling extra fields (strict schema)', () => {
    const result = healthCheckSchema.safeParse({ url: 'https://example.com', extra: 'ignored' });
    assert.equal(result.success, false);
  });
});
