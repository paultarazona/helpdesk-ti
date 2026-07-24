const express = require('express');
const { csrfProtection } = require('../../config/csrf');
const { validate } = require('../../core/middleware/validate');
const { DiagnosticsController } = require('./controller');
const { pingSchema, healthCheckSchema } = require('./validators');

// Same reasoning as v2-seguro/src/modules/assets/routes.js: `_csrf` is a
// transport-level field added by the CSRF middleware/form, not a domain
// field, so it must be stripped before the strict Zod schemas run (which
// reject unknown keys via `.strict()`).
function stripCsrfField(request, _response, next) {
  if (request.body && typeof request.body === 'object') {
    delete request.body._csrf;
  }
  next();
}

function createDiagnosticsRouter() {
  const router = express.Router();
  const controller = new DiagnosticsController();

  router.get('/', controller.index);
  router.post('/ping', csrfProtection, stripCsrfField, validate(pingSchema), controller.ping);
  router.post('/health-check', csrfProtection, stripCsrfField, validate(healthCheckSchema), controller.healthCheck);

  return router;
}

module.exports = { createDiagnosticsRouter };
