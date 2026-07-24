const helmet = require('helmet');

// Hardened contrast with v1 (which does not use helmet at all, VULN-012).
// A Content-Security-Policy is included because tickets/comments render
// user-supplied content server-side via EJS (mitigation for stored/reflected XSS).
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
};

module.exports = { helmetOptions, helmetMiddleware: helmet(helmetOptions) };
