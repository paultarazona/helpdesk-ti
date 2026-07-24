const { AppError } = require('../errors/AppError');

// Generic Zod validation wrapper. Modules (auth/tickets/assets/comments)
// will define their own zod schemas under `<module>/validators.js` in the
// next milestone and pass them in here — mitigates VULN-001 (SQLi) and
// VULN-007/008 (command injection/SSRF) at the boundary by rejecting
// malformed input before it reaches any service/repository.

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body' | 'params' | 'query'} [source='body']
 * @returns {import('express').RequestHandler}
 */
function validate(schema, source = 'body') {
  return function validateMiddleware(request, _response, next) {
    const result = schema.safeParse(request[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      next(new AppError(`Invalid input: ${details}`, 400));
      return;
    }

    request[source] = result.data;
    next();
  };
}

module.exports = { validate };
