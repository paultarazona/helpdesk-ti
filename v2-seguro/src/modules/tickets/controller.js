const { generateCsrfToken } = require('../../config/csrf');
const { AppError } = require('../../core/errors/AppError');
const { CommentsService } = require('../comments/service');
const { AttachmentsService } = require('../attachments/service');
const { TicketsService } = require('./service');

/**
 * Parses and validates a route `:id` param as a positive integer.
 * Returns null for anything else (non-numeric, negative, float, etc.) so the
 * caller can respond with the same generic 404 used for IDOR — never a 400
 * or 500 that would behave differently for a malformed id vs. a
 * well-formed-but-nonexistent one.
 */
function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

class TicketsController {
  /**
   * @param {TicketsService} [service]
   * @param {CommentsService} [commentsService]
   */
  constructor(service = new TicketsService(), commentsService = new CommentsService(), attachmentsService = new AttachmentsService()) {
    this.service = service;
    this.commentsService = commentsService;
    this.attachmentsService = attachmentsService;
  }

  index = async (request, response, next) => {
    try {
      const { search, status, priority } = request.validatedQuery;
      const tickets = await this.service.list({ search, status, priority });
      response.render('tickets/index', { tickets, search, status, priority });
    } catch (error) {
      next(error);
    }
  };

  newForm = async (request, response, next) => {
    try {
      const assets = await this.service.listAssetsForForm();
      response.render('tickets/form', {
        ticket: {},
        assets,
        action: '/tickets',
        heading: 'Crear ticket',
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (request, response, next) => {
    try {
      const ticket = await this.service.create(request.body, request.user.id);
      response.redirect(`/tickets/${ticket.id}`);
    } catch (error) {
      next(error);
    }
  };

  show = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Ticket not found.', 404);

      const ticket = await this.service.getOwnedTicket(id, request.user);
      // Comments are listed via CommentsService, which re-checks ticket
      // ownership itself (VULN-004/IDOR) — a non-owner never reaches this
      // line (getOwnedTicket above already threw the generic 404), but the
      // comments module doesn't rely on that; it enforces the same rule
      // independently so it stays safe if ever called from elsewhere.
      const comments = await this.commentsService.listForTicket(id, request.user);
      const attachments = await this.attachmentsService.listForTicket(id, request.user);
      response.render('tickets/show', {
        ticket,
        comments,
        attachments,
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };

  editForm = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Ticket not found.', 404);

      const ticket = await this.service.getOwnedTicket(id, request.user);
      const assets = await this.service.listAssetsForForm();
      response.render('tickets/form', {
        ticket,
        assets,
        action: `/tickets/${id}`,
        heading: 'Editar ticket',
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Ticket not found.', 404);

      await this.service.update(id, request.user, request.body);
      response.redirect(`/tickets/${id}`);
    } catch (error) {
      next(error);
    }
  };

  close = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Ticket not found.', 404);

      await this.service.close(id, request.user);
      response.redirect(`/tickets/${id}`);
    } catch (error) {
      next(error);
    }
  };

  remove = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Ticket not found.', 404);

      await this.service.remove(id, request.user);
      response.redirect('/tickets');
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { TicketsController, parseId };
