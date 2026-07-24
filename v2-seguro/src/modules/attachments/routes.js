const express = require('express');
const multer = require('multer');
const { csrfProtection } = require('../../config/csrf');
const { AppError } = require('../../core/errors/AppError');
const { requireAuth } = require('../../core/middleware/authMiddleware');
const { AttachmentsController } = require('./controller');
const { MAX_FILE_SIZE_BYTES } = require('./service');

// Mitigates [VULN-006][A05:Unrestricted-Upload][CWE-434]: `memoryStorage`
// (never `diskStorage` with the client's original name) so the buffer can
// be inspected (service.js's magic-number sniffing) before anything is
// ever written to disk, and `limits.fileSize` rejects oversized uploads
// before the whole buffer is even held in memory — in direct contrast with
// v1 (v1-inseguro/src/modules/attachments/routes.js), which has no size
// limit and writes the client's buffer to disk unconditionally.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

// Same reasoning as tickets/routes.js and comments/routes.js: `_csrf` is a
// transport-level field, not a domain field, so it must be stripped before
// any strict validation. Attachments have no Zod body schema (the payload
// is multipart file data handled entirely by Multer + the service's
// content-based whitelist), but the field still needs to be removed so it
// never ends up misread as part of the file field set.
function stripCsrfField(request, _response, next) {
  if (request.body && typeof request.body === 'object') {
    delete request.body._csrf;
  }
  next();
}

// Wraps multer's single-file middleware so a `LIMIT_FILE_SIZE` (or any
// other Multer) error becomes a normal AppError the centralized error
// handler already knows how to render, instead of an uncaught exception.
function uploadSingleFile(request, response, next) {
  upload.single('attachment')(request, response, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('File exceeds the maximum allowed size (5 MB).', 400));
      return;
    }

    next(new AppError('File upload failed.', 400));
  });
}

// Mounted at the same '/tickets' prefix as tickets/routes.js and
// comments/routes.js (see src/app.js) — attachments only ever exist
// nested under a ticket.
function createAttachmentsRouter() {
  const router = express.Router();
  const controller = new AttachmentsController();

  // NOTE ordering: `uploadSingleFile` (Multer) MUST run before
  // `csrfProtection`. express.json()/express.urlencoded() (app.js) never
  // parse `multipart/form-data` bodies, so `request.body._csrf` would still
  // be `undefined` when csrf-csrf reads it (see config/csrf.js's
  // `getTokenFromRequest`) if CSRF ran first — the token only becomes
  // readable once Multer has parsed the multipart form's text fields.
  router.post(
    '/:ticketId/attachments',
    requireAuth,
    uploadSingleFile,
    csrfProtection,
    stripCsrfField,
    controller.upload
  );

  router.get('/:ticketId/attachments/:id/download', requireAuth, controller.download);

  return router;
}

module.exports = { createAttachmentsRouter };
