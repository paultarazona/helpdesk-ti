const { doubleCsrf } = require('csrf-csrf');
const { env } = require('./env');

// CSRF decision (see v2-seguro/README.md for the full rationale):
// `csurf` is deprecated and unmaintained upstream, so it is intentionally
// NOT used here. Instead this uses `csrf-csrf`, an actively maintained
// double-submit-cookie implementation with the same underlying strategy
// the plan describes (mitigates VULN-005 CSRF), plus SameSite cookies.
//
// Mitigates: [VULN-005][A01:CSRF][CWE-352] state-changing form submissions
// (ticket status change/delete, etc.) require a token that an attacker's
// cross-site form cannot read or forge.
// NOTE: `doubleCsrf()` returns a utility named `generateToken`, not
// `generateCsrfToken` — the previous version of this file destructured the
// wrong name, which silently produced `generateCsrfToken === undefined`.
// Renamed on import and re-exported under the name the rest of the app
// (auth controller, EJS views) expects.
const { generateToken: generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.JWT_SECRET,
  getSessionIdentifier: (request) => (request.user ? String(request.user.id) : 'anonymous'),
  cookieName: env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/',
  },
  size: 64,
  // NOTE: the correct option name in csrf-csrf@3.x is `getTokenFromRequest`
  // (the previous version of this file used `getCsrfTokenFromRequest`, which
  // is not a recognized option). Because the option name didn't match, the
  // library silently fell back to its own default —
  // `(req) => req.headers['x-csrf-token']` — which never reads the form's
  // `_csrf` field at all. That made every POST fail CSRF validation even
  // when the client correctly resubmitted the token from the hidden input,
  // since `validateRequest` compared the cookie's token against `undefined`.
  getTokenFromRequest: (request) => request.body?._csrf || request.headers['x-csrf-token'],
});

module.exports = { generateCsrfToken, csrfProtection: doubleCsrfProtection };
