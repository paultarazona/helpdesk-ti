const pino = require('pino');
const { env } = require('../config/env');

// Structured logging (hardened contrast with v1, which uses scattered
// console.log or nothing at all). Redact anything that could carry a
// secret or credential — never log passwords/tokens.
const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash', '*.token'],
    censor: '[REDACTED]',
  },
});

module.exports = { logger };
