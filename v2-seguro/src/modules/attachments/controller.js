const fs = require('node:fs');
const { AppError } = require('../../core/errors/AppError');
const { parseId } = require('../tickets/controller');
const { AttachmentsService } = require('./service');

class AttachmentsController {
  /**
   * @param {AttachmentsService} [service]
   */
  constructor(service = new AttachmentsService()) {
    this.service = service;
  }

  upload = async (request, response, next) => {
    try {
      const ticketId = parseId(request.params.ticketId);
      if (ticketId === null) throw new AppError('Ticket not found.', 404);

      await this.service.upload(ticketId, request.user, request.file);
      response.redirect(`/tickets/${ticketId}`);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Streams the attachment's bytes back to the client. Ownership is
   * re-verified here (via the service) before the file is ever read from
   * disk — never a direct static-file path, in contrast with v1 serving
   * `public/uploads/*` unauthenticated via express.static.
   */
  download = async (request, response, next) => {
    try {
      const ticketId = parseId(request.params.ticketId);
      const attachmentId = parseId(request.params.id);
      if (ticketId === null || attachmentId === null) throw new AppError('Attachment not found.', 404);

      const { attachment, filePath } = await this.service.getForDownload(ticketId, attachmentId, request.user);

      response.setHeader('Content-Type', attachment.mime_type);
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.original_filename)}"`
      );

      const stream = fs.createReadStream(filePath);
      stream.on('error', next);
      stream.pipe(response);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { AttachmentsController };
