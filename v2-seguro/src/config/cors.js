const { env } = require('./env');

// Hardened contrast with v1 (which uses `cors({ origin: '*' })`): the
// allowed origin comes from configuration and defaults to nothing permissive.
// Never widen this to '*' in production.
const corsOptions = {
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
};

module.exports = { corsOptions };
