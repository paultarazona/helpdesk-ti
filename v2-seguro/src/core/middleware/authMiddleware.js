const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { AppError } = require('../errors/AppError');

// Hardened contrast with v1 (src/core/middleware/auth.js, VULN-011):
// - secret comes only from env (no hardcoded fallback)
// - algorithm is explicitly pinned to HS256 (mitigates the classic
//   "alg confusion" attack, e.g. an attacker sending alg: none or switching
//   to an asymmetric algorithm the server would otherwise accept)
// - short expiration enforced via JWT_EXPIRES_IN at sign time
const ALLOWED_ALGORITHMS = ['HS256'];

/**
 * Verifies the JWT carried in the `token` cookie and attaches the decoded
 * payload to `request.user`. Does not redirect/reject by itself — pair with
 * `requireAuth` for routes that must be authenticated.
 */
function attachUser(request, response, next) {
  const token = request.cookies?.token;

  request.user = null;

  if (token) {
    try {
      request.user = jwt.verify(token, env.JWT_SECRET, { algorithms: ALLOWED_ALGORITHMS });
    } catch (_error) {
      request.user = null;
    }
  }

  // Mirrors v1's header.ejs pattern (request.user / response.locals.user):
  // EJS views branch on `user` presence to render the authenticated shell
  // vs. the anonymous top bar, so views need this on response.locals, not
  // just on the request object.
  response.locals.user = request.user;

  next();
}

/**
 * Rejects the request with 401 unless attachUser found a valid user.
 */
function requireAuth(request, _response, next) {
  if (!request.user) {
    next(new AppError('Authentication required.', 401));
    return;
  }

  next();
}

module.exports = { attachUser, requireAuth, ALLOWED_ALGORITHMS };
