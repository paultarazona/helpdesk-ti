const express = require('express');
const { csrfProtection } = require('../../config/csrf');
const { requireAuth } = require('../../core/middleware/authMiddleware');
const { validate } = require('../../core/middleware/validate');
const { CommentsController } = require('./controller');
const { createCommentSchema } = require('./validators');

// Same reasoning as tickets/routes.js and auth/routes.js: `_csrf` is a
// transport-level field added by the CSRF middleware/form, not a domain
// field, so it must be stripped before the strict Zod schema runs (which
// rejects unknown keys).
function stripCsrfField(request, _response, next) {
  if (request.body && typeof request.body === 'object') {
    delete request.body._csrf;
  }
  next();
}

// Mounted at the same '/tickets' prefix as tickets/routes.js (see
// src/app.js) rather than as its own top-level resource — comments only
// ever exist nested under a ticket, mirroring the plan's ticket-detail view
// (docs/plan-mesa-ayuda-ti.md §6).
function createCommentsRouter() {
  const router = express.Router();
  const controller = new CommentsController();

  router.post(
    '/:ticketId/comments',
    requireAuth,
    csrfProtection,
    stripCsrfField,
    validate(createCommentSchema),
    controller.create
  );

  return router;
}

module.exports = { createCommentsRouter };
