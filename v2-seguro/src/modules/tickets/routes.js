const express = require('express');
const { csrfProtection } = require('../../config/csrf');
const { AppError } = require('../../core/errors/AppError');
const { requireAuth } = require('../../core/middleware/authMiddleware');
const { validate } = require('../../core/middleware/validate');
const { TicketsController } = require('./controller');
const { createTicketSchema, updateTicketSchema, ticketQuerySchema } = require('./validators');

// Same reasoning as v2-seguro/src/modules/auth/routes.js: `_csrf` is a
// transport-level field added by the CSRF middleware/form, not a domain
// field, so it must be stripped before the strict Zod schemas run (which
// reject unknown keys).
function stripCsrfField(request, _response, next) {
  if (request.body && typeof request.body === 'object') {
    delete request.body._csrf;
  }
  next();
}

// NOTE: intentionally NOT using the shared `validate()` middleware
// (core/middleware/validate.js) for query params. That middleware does
// `request[source] = result.data`, which works for `body` (a plain,
// writable object set by express.urlencoded/json) but Express 5's
// `request.query` is an accessor with no setter — assigning to it is a
// silent no-op in non-strict CommonJS modules, so the validated/defaulted
// query would never actually reach the controller. Storing the parsed
// result on a new property (`request.validatedQuery`) sidesteps that
// entirely without touching the shared middleware other modules rely on.
function validateQuery(schema) {
  return function validateQueryMiddleware(request, _response, next) {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      next(new AppError(`Invalid input: ${details}`, 400));
      return;
    }

    request.validatedQuery = result.data;
    next();
  };
}

function createTicketsRouter() {
  const router = express.Router();
  const controller = new TicketsController();

  // Every ticket route requires authentication (mirrors v1's intent, but
  // v1 never actually enforces ownership past that point — see
  // service.js for the IDOR mitigation, VULN-004).
  router.use(requireAuth);

  router.get('/', validateQuery(ticketQuerySchema), controller.index);
  router.get('/new', controller.newForm);
  router.post('/', csrfProtection, stripCsrfField, validate(createTicketSchema), controller.create);
  router.get('/:id', controller.show);
  router.get('/:id/edit', controller.editForm);
  router.post('/:id', csrfProtection, stripCsrfField, validate(updateTicketSchema), controller.update);
  router.post('/:id/close', csrfProtection, stripCsrfField, controller.close);
  router.post('/:id/delete', csrfProtection, stripCsrfField, controller.remove);

  return router;
}

module.exports = { createTicketsRouter };
