const { AppError } = require('../errors/AppError');

// Hardened contrast with v1 (VULN-014): v1 has no role check on admin
// routes at all. v2 provides a generic RBAC middleware factory so every
// module (auth/tickets/assets/comments/diagnostics) can restrict routes to
// specific roles.

/**
 * @param {...string} allowedRoles - Roles permitted to access the route.
 * @returns {import('express').RequestHandler}
 */
function authorize(...allowedRoles) {
  return function authorizeMiddleware(request, _response, next) {
    if (!request.user) {
      next(new AppError('Authentication required.', 401));
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      // Same generic message/status regardless of which role was expected,
      // so the response does not leak which roles exist.
      next(new AppError('You do not have permission to access this resource.', 403));
      return;
    }

    next();
  };
}

module.exports = { authorize };
