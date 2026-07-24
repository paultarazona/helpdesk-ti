const { execFile } = require('node:child_process');
const dns = require('node:dns').promises;
const net = require('node:net');
const { URL } = require('node:url');
const { AppError } = require('../../core/errors/AppError');

// `fetch`/`AbortSignal` are Node >=22 globals (see package.json engines).
// Referenced via `globalThis` here because the project's eslint flat config
// (eslint.config.js) does not declare them, and this module is the first to
// use them.
const { fetch, AbortSignal } = globalThis;

const PING_TIMEOUT_MS = 5000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Mitigates [VULN-007][A03:Command-Injection][CWE-78].
 *
 * v1 (v1-inseguro/src/modules/diagnostics/routes.js) builds a shell command
 * string (`ping -c 1 ${target}`) and hands it to `exec`, which spawns a
 * shell (`/bin/sh -c ...`) that interprets `;`, `|`, `&`, backticks, etc.
 * Here the binary and its arguments are passed as a plain argv ARRAY to
 * `execFile`, which spawns `ping` directly with no shell in between — there
 * is nothing to interpret shell metacharacters even if one slipped through
 * validation (it cannot: modules/diagnostics/validators.js already rejects
 * anything that is not a strict IPv4 address before this function is ever
 * called).
 *
 * `-n`/`-c` count and per-run timeout keep this from hanging a request
 * indefinitely against an unreachable host.
 */
function buildPingArgs(ipv4) {
  return process.platform === 'win32' ? ['-n', '4', ipv4] : ['-c', '4', ipv4];
}

function runPing(ipv4) {
  return new Promise((resolve, reject) => {
    execFile('ping', buildPingArgs(ipv4), { timeout: PING_TIMEOUT_MS }, (error, stdout, stderr) => {
      // A non-zero exit (host unreachable, timeout) is a normal diagnostic
      // outcome, not a server error — surface it as a 502 with a safe
      // message rather than leaking the raw child_process error.
      if (error && !stdout && !stderr) {
        reject(new AppError('Diagnostic ping failed to run.', 502));
        return;
      }

      resolve(stdout || stderr || 'No output.');
    });
  });
}

// Mitigates [VULN-008][A10:SSRF][CWE-918].
//
// Blocked ranges: loopback (127.0.0.0/8, ::1), RFC1918 private ranges
// (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local (169.254.0.0/16 —
// this is the range that contains the cloud metadata endpoint
// 169.254.169.254 — and its IPv6 equivalent fe80::/10), IPv6 unique local
// addresses (fc00::/7, the IPv6 analogue of RFC1918), and 0.0.0.0/8.
function isBlockedIPv4(ipv4) {
  const octets = ipv4.split('.').map(Number);
  const [a, b] = octets;

  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8

  return false;
}

function isBlockedIPv6(ipv6) {
  const normalized = ipv6.toLowerCase();

  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true; // unspecified
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 — validate the embedded IPv4.
  const mappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedMatch) return isBlockedIPv4(mappedMatch[1]);

  return false;
}

function isBlockedIp(ip) {
  const version = net.isIP(ip);

  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);

  return true; // Not a recognizable IP shape at all — fail closed.
}

/**
 * Resolves a hostname to every IP it maps to (a hostname can have multiple
 * A/AAAA records; checking only the first would let an attacker publish one
 * public + one private/loopback record and hope only the public one gets
 * inspected). Resolution happens at REQUEST time, not at validation time —
 * this is what closes the DNS-rebinding bypass: an attacker cannot register
 * a hostname that resolves to a public IP during a hypothetical earlier
 * "validation" pass and then repoint it to 127.0.0.1 by the time the real
 * request fires, because there is only ever one resolution, immediately
 * before the fetch it gates.
 */
async function resolveAllIps(hostname) {
  if (net.isIP(hostname)) return [hostname];

  const records = await dns.lookup(hostname, { all: true });
  return records.map((record) => record.address);
}

class DiagnosticsService {
  /**
   * @param {string} ipv4 - Already validated by validators.js (pingSchema).
   */
  async ping(ipv4) {
    return runPing(ipv4);
  }

  /**
   * @param {string} rawUrl - Already validated as a well-formed http(s) URL
   *   by validators.js (healthCheckSchema). The allowlist/denylist decision
   *   happens here because it depends on DNS resolution done at request
   *   time.
   */
  async healthCheck(rawUrl) {
    const url = new URL(rawUrl);

    // Defense-in-depth: reject the literal hostname `localhost` outright,
    // in addition to the resolved-IP check below (some resolvers/hosts
    // files could map it to something other than 127.0.0.1).
    if (url.hostname.toLowerCase() === 'localhost') {
      throw new AppError('That destination is not allowed.', 400);
    }

    let ips;
    try {
      ips = await resolveAllIps(url.hostname);
    } catch (_error) {
      throw new AppError('Could not resolve the health-check destination.', 400);
    }

    if (ips.length === 0 || ips.some((ip) => isBlockedIp(ip))) {
      throw new AppError('That destination is not allowed.', 400);
    }

    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
    } catch (_error) {
      throw new AppError('The health-check request failed.', 502);
    }

    const body = await response.text();
    return { status: response.status, body };
  }
}

module.exports = { DiagnosticsService, isBlockedIp, isBlockedIPv4, isBlockedIPv6 };
