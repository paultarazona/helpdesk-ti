const { z } = require('zod');

// Mitigates [VULN-007][A03:Command-Injection][CWE-78].
//
// v1 (v1-inseguro/src/modules/diagnostics/routes.js) accepts ANY string in
// `target` and concatenates it directly into a shell command string passed
// to `exec` (`ping -c 1 ${target}`), which is exactly what makes a payload
// like `8.8.8.8; cat /etc/passwd` work there: the shell splits on `;` and
// runs the second command.
//
// Here `target` must parse as a strict IPv4 address BEFORE it is ever
// passed to process execution (service.js uses `execFile`, never a shell
// string). A payload like `8.8.8.8; cat /etc/passwd`, `` `whoami` ``, or
// `$(whoami)` is not a valid IPv4 address, so `z.string().ip()` rejects it
// outright and the request never reaches `execFile` — no need for a
// separate shell-metacharacter denylist, since "is this a valid IPv4
// address" is already a strict allowlist that excludes every shell
// metacharacter by construction.
//
// Hostnames are intentionally NOT accepted, unlike v1. This tool exists to
// ping a known asset by its stored `ip_address` (see
// modules/assets/validators.js, which also validates as `.ip()`), so
// restricting to IPv4 keeps real functional parity for that use case while
// closing the DNS-based avenue v1 otherwise leaves open (a malicious
// hostname could still be built to resolve to something unexpected, or the
// resolution step itself could become a new injection point).
const pingSchema = z
  .object({
    target: z.string().ip({ version: 'v4', message: 'target must be a valid IPv4 address.' }),
  })
  .strict();

// Mitigates [VULN-008][A10:SSRF][CWE-918].
//
// This schema only checks that the input is a well-formed http(s) URL. It
// deliberately does NOT decide whether the destination is allowed — that
// decision requires resolving the hostname to an IP address first (to catch
// both a literal private/loopback IP in the URL AND a hostname that
// resolves to one), which can only happen at request time, not at
// schema-parse time. See service.js for the actual allow/deny logic
// (blocks loopback, RFC1918 private ranges, and link-local — which
// includes the cloud metadata endpoint 169.254.169.254).
const healthCheckSchema = z
  .object({
    url: z
      .string()
      .url({ message: 'url must be a valid URL.' })
      .refine((value) => /^https?:\/\//i.test(value), { message: 'url must use the http or https scheme.' }),
  })
  .strict();

module.exports = { pingSchema, healthCheckSchema };
