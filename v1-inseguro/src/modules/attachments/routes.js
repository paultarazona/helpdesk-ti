const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { pool } = require('../../db/connection');

function createAttachmentsRouter(
  database = pool,
  uploadDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads')
) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  router.post('/:ticketId/attachments', upload.single('attachment'), async (request, response, next) => {
    try {
      const file = request.file;
      // [VULN-006][A05:Unrestricted-Upload][CWE-434] No type, content, or size validation is applied.
      // [VULN-006][A05:Path-Traversal][CWE-22] The client controls the final path under public storage.
      const storagePath = request.body.storagePath || file.originalname;
      const destination = path.join(uploadDir, storagePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.buffer);

      const publicPath = path.relative(path.dirname(uploadDir), destination).replaceAll('\\', '/');
      await database.query(
        `INSERT INTO ticket_attachments
         (ticket_id, uploaded_by_user_id, original_name, storage_path, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [Number(request.params.ticketId), request.user.id, file.originalname, publicPath, file.mimetype, file.size]
      );
      response.redirect(`/tickets/${request.params.ticketId}`);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAttachmentsRouter };
