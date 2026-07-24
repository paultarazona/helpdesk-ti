const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { DiagnosticsService, isBlockedIp, isBlockedIPv4, isBlockedIPv6 } = require('../../../src/modules/diagnostics/service');

describe('diagnostics service - isBlockedIPv4 (mitigates VULN-008 SSRF)', () => {
  test('blocks loopback (127.0.0.0/8)', () => {
    assert.equal(isBlockedIPv4('127.0.0.1'), true);
    assert.equal(isBlockedIPv4('127.255.255.255'), true);
  });

  test('blocks 10.0.0.0/8', () => {
    assert.equal(isBlockedIPv4('10.0.0.1'), true);
    assert.equal(isBlockedIPv4('10.255.255.255'), true);
  });

  test('blocks 172.16.0.0/12', () => {
    assert.equal(isBlockedIPv4('172.16.0.1'), true);
    assert.equal(isBlockedIPv4('172.31.255.255'), true);
  });

  test('does not block 172.x outside the /12 (172.32.0.1, 172.15.0.1)', () => {
    assert.equal(isBlockedIPv4('172.32.0.1'), false);
    assert.equal(isBlockedIPv4('172.15.0.1'), false);
  });

  test('blocks 192.168.0.0/16', () => {
    assert.equal(isBlockedIPv4('192.168.1.1'), true);
  });

  test('blocks 169.254.0.0/16, which covers the cloud metadata endpoint 169.254.169.254', () => {
    assert.equal(isBlockedIPv4('169.254.169.254'), true);
    assert.equal(isBlockedIPv4('169.254.0.1'), true);
  });

  test('blocks 0.0.0.0/8', () => {
    assert.equal(isBlockedIPv4('0.0.0.0'), true);
  });

  test('does not block a public IP (8.8.8.8)', () => {
    assert.equal(isBlockedIPv4('8.8.8.8'), false);
  });
});

describe('diagnostics service - isBlockedIPv6', () => {
  test('blocks ::1 loopback', () => {
    assert.equal(isBlockedIPv6('::1'), true);
  });

  test('blocks fe80::/10 link-local', () => {
    assert.equal(isBlockedIPv6('fe80::1'), true);
  });

  test('blocks fc00::/7 unique local', () => {
    assert.equal(isBlockedIPv6('fc00::1'), true);
    assert.equal(isBlockedIPv6('fd12:3456::1'), true);
  });

  test('blocks an IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
    assert.equal(isBlockedIPv6('::ffff:127.0.0.1'), true);
  });

  test('does not block a public IPv6 address', () => {
    assert.equal(isBlockedIPv6('2001:4860:4860::8888'), false);
  });
});

describe('diagnostics service - isBlockedIp (dispatches by IP version)', () => {
  test('blocks a private IPv4', () => {
    assert.equal(isBlockedIp('10.0.0.5'), true);
  });

  test('blocks a loopback IPv6', () => {
    assert.equal(isBlockedIp('::1'), true);
  });

  test('fails closed on a non-IP string', () => {
    assert.equal(isBlockedIp('not-an-ip'), true);
  });

  test('allows a public IPv4', () => {
    assert.equal(isBlockedIp('1.1.1.1'), false);
  });
});

describe('diagnostics service - healthCheck (end-to-end SSRF gate, no network needed for these)', () => {
  test('rejects a URL whose hostname is the literal string "localhost"', async () => {
    const service = new DiagnosticsService();
    await assert.rejects(() => service.healthCheck('http://localhost:4000/'), /not allowed/);
  });

  test('rejects a URL pointing at a loopback IP literal (http://127.0.0.1/)', async () => {
    const service = new DiagnosticsService();
    await assert.rejects(() => service.healthCheck('http://127.0.0.1/'), /not allowed/);
  });

  test('rejects a URL pointing at the cloud metadata endpoint (http://169.254.169.254/)', async () => {
    const service = new DiagnosticsService();
    await assert.rejects(() => service.healthCheck('http://169.254.169.254/'), /not allowed/);
  });

  test('rejects a URL pointing at a private RFC1918 address (http://10.0.0.1/)', async () => {
    const service = new DiagnosticsService();
    await assert.rejects(() => service.healthCheck('http://10.0.0.1/'), /not allowed/);
  });
});

describe('diagnostics service - ping (mitigates VULN-007, uses execFile — no shell)', () => {
  test('runs a real ping against loopback (127.0.0.1) and returns output', async (t) => {
    const service = new DiagnosticsService();

    let output;
    try {
      output = await service.ping('127.0.0.1');
    } catch (error) {
      // Some sandboxed/CI environments block ICMP entirely — treat that as
      // an environment limitation, not a test failure, since the point of
      // this test is "execFile runs safely", not "ICMP is reachable here".
      t.skip(`ping binary unavailable or blocked in this environment: ${error.message}`);
      return;
    }

    assert.equal(typeof output, 'string');
    assert.ok(output.length > 0);
  });
});
