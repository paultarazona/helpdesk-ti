const express = require('express');
const { csrfProtection } = require('../../config/csrf');
const { AppError } = require('../../core/errors/AppError');
const { requireAuth } = require('../../core/middleware/authMiddleware');
const { validate } = require('../../core/middleware/validate');
const { AssetsController } = require('./controller');
const { createAssetSchema, updateAssetSchema, assetQuerySchema } = require('./validators');

// Same reasoning as v2-seguro/src/modules/tickets/routes.js: `_csrf` is a
// transport-level field added by the CSRF middleware/form, not a domain
// field, so it must be stripped before the strict Zod schemas run (which
// reject unknown keys).
function stripCsrfField(request, _response, next) {
  if (request.body && typeof request.body === 'object') {
    delete request.body._csrf;
  }
  next();
}

// NOTE: intentionally NOT using the shared `validate()` middleware for
// query params, same Express 5 workaround as tickets/routes.js — `request.query`
// is a getter-only accessor in Express 5, so `request.query = result.data`
// is a silent no-op. Storing the parsed result on `request.validatedQuery`
// sidesteps that.
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

function createAssetsRouter() {
  const router = express.Router();
  const controller = new AssetsController();

  // Every asset route requires authentication only — no role restriction
  // (`authorize`) is applied. Confirmed from v1
  // (v1-inseguro/src/modules/assets/routes.js): it has zero role check on
  // any asset route (any authenticated user, including the plain `user`
  // role, can create/edit/delete any asset) and its only VULN marker on
  // assets is VULN-004 (IDOR via raw/unvalidated ids), never VULN-014
  // (broken access control by role) — that marker is used exclusively on
  // the admin module in v1. Inventing a write-RBAC restriction here would
  // not be mitigating a real v1 vulnerability, so parity is kept and the
  // real fixes applied are: parametrized queries (repository.js) + integer
  // id validation + a generic 404 for malformed/nonexistent ids
  // (controller.js).
  router.use(requireAuth);

  router.get('/', validateQuery(assetQuerySchema), controller.index);
  router.get('/new', controller.newForm);
  router.post('/', csrfProtection, stripCsrfField, validate(createAssetSchema), controller.create);
  router.get('/:id', controller.show);
  router.get('/:id/edit', controller.editForm);
  router.post('/:id', csrfProtection, stripCsrfField, validate(updateAssetSchema), controller.update);
  router.post('/:id/delete', csrfProtection, stripCsrfField, controller.remove);

  return router;
}

module.exports = { createAssetsRouter };
