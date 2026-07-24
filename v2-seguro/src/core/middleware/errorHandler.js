const { AppError } = require('../errors/AppError');
const { logger } = require('../logger');

// Safe, generic client-facing messages for trusted non-AppError errors whose
// own `.message` is a library implementation detail we don't want to leak
// verbatim to the client, but whose failure mode is well-understood and safe
// to name explicitly. Keyed by the error's `.code` (a stable identifier set
// by the throwing library), not by its message text.
const KNOWN_TRUSTED_ERROR_MESSAGES = {
  // Thrown by csrf-csrf's doubleCsrfProtection middleware (via http-errors)
  // when the double-submit token/cookie pair is missing or doesn't match.
  EBADCSRFTOKEN: 'Invalid or missing CSRF token.',
};

// http-errors (used by csrf-csrf and other trusted middleware) sets
// `expose = true` for 4xx errors, signalling the message/status are meant to
// be shown to clients — as opposed to unexpected 5xx/programming errors,
// where `expose` is false or absent. We only trust `expose` combined with a
// valid 4xx `statusCode`/`status`, and we still never forward the library's
// raw `.message` — only our own known-safe copy (see map above), falling
// back to a generic "Invalid request." for any other exposed 4xx error.
function isTrustedExposedClientError(error) {
  const statusCode = Number(error.statusCode ?? error.status);
  return error.expose === true && Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500;
}

// Hardened contrast with v1 (src/app.js, VULN-012/CWE-209): v1's error
// handler sends `error.stack` straight to the client. This handler logs the
// full error server-side (via pino) and only ever returns a generic message
// and the appropriate status code to the client — never a stack trace, and
// never a raw library error message that might leak implementation details.
//
// Must be registered LAST, after all routes, and keep all four params
// (request, response, next) even though `next` is unused — Express only
// treats a middleware as an error handler when it has arity 4.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, request, response, _next) {
  if (error instanceof AppError && error.isOperational) {
    logger.warn({ err: error, path: request.path }, 'Handled operational error');
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  if (isTrustedExposedClientError(error)) {
    const statusCode = Number(error.statusCode ?? error.status);
    const safeMessage = KNOWN_TRUSTED_ERROR_MESSAGES[error.code] ?? 'Invalid request.';
    logger.warn({ err: error, path: request.path }, 'Handled trusted library error');
    response.status(statusCode).json({ error: safeMessage });
    return;
  }

  logger.error({ err: error, path: request.path }, 'Unhandled error');
  response.status(500).json({ error: 'Internal server error.' });
}

module.exports = { errorHandler };
