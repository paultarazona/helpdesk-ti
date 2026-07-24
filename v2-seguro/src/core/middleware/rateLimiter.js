const rateLimit = require('express-rate-limit');

// Hardened contrast with v1 (VULN-009): v1 has no rate limiting on login at
// all, making it trivially brute-forceable with Hydra. v2 adds a strict
// limiter for auth endpoints and a looser general-purpose limiter for the
// rest of the API.

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

module.exports = { loginLimiter, generalLimiter };
