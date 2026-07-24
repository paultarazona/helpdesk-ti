const express = require('express');
const { csrfProtection } = require('../../config/csrf');
const { loginLimiter } = require('../../core/middleware/rateLimiter');
const { validate } = require('../../core/middleware/validate');
const { AuthController } = require('./controller');
const { registerSchema, loginSchema } = require('./validators');

// The `_csrf` field is a transport-level concern (added by the form/CSRF
// middleware), not a domain field — strip it before the strict Zod schemas
// run, so `_csrf` doesn't trip `.strict()` (which exists specifically to
// reject unexpected fields like a client-supplied `role`).
function stripCsrfField(request, _response, next) {
  if (request.body && typeof request.body === 'object') {
    delete request.body._csrf;
  }
  next();
}

/**
 * Mirrors v1's top-level routes (no path prefix): GET/POST /register,
 * GET/POST /login, POST /logout.
 */
function createAuthRouter() {
  const router = express.Router();
  const controller = new AuthController();

  router.get('/register', controller.showRegisterForm);
  router.post(
    '/register',
    csrfProtection,
    stripCsrfField,
    validate(registerSchema),
    controller.registerSubmit
  );

  router.get('/login', controller.showLoginForm);
  // loginLimiter directly mitigates VULN-009 (v1 has no rate limiting on
  // login at all, making it trivially brute-forceable). Applied only to
  // this route, not globally.
  router.post(
    '/login',
    loginLimiter,
    csrfProtection,
    stripCsrfField,
    validate(loginSchema),
    controller.loginSubmit
  );

  router.post('/logout', controller.logout);

  return router;
}

module.exports = { createAuthRouter };
