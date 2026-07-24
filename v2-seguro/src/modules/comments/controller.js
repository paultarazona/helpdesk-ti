const { AppError } = require('../../core/errors/AppError');
const { parseId } = require('../tickets/controller');
const { CommentsService } = require('./service');

class CommentsController {
  /**
   * @param {CommentsService} [service]
   */
  constructor(service = new CommentsService()) {
    this.service = service;
  }

  create = async (request, response, next) => {
    try {
      const ticketId = parseId(request.params.ticketId);
      if (ticketId === null) throw new AppError('Ticket not found.', 404);

      await this.service.create(ticketId, request.user, request.body);
      response.redirect(`/tickets/${ticketId}`);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { CommentsController };
