const DOMPurify = require('isomorphic-dompurify');
const { TicketsService } = require('../tickets/service');
const { CommentsRepository } = require('./repository');

// Sanitization decision (mitigates [VULN-002][A03:XSS-Stored][CWE-79] — the
// exact vulnerability v1-inseguro/src/views/tickets/detail.ejs has for
// comment bodies, see the `<!-- [VULN-002] -->` marker there rendering
// `comment.body` with `<%- %>`, unescaped).
//
// Sanitize on WRITE (here, before the row is ever persisted), not on read:
//   - Simpler: there is exactly one place that can forget to sanitize
//     (this method), instead of every current and future render site
//     (ticket detail page today; a future notifications email, admin
//     export, or API response tomorrow) each having to remember to escape.
//   - Comments in this app are plain text, never rich-formatted — there is
//     no legitimate need to retain the original raw HTML for later re-use,
//     so "losing the original" (the usual argument for sanitizing on read)
//     costs nothing here.
//   - Trade-off accepted: if the sanitization policy changes later (e.g. to
//     allow a safe subset of formatting tags), old rows already stored
//     without that formatting would need a backfill/migration — acceptable
//     for this course project's scope.
// `ALLOWED_TAGS: []` strips all markup entirely (script/style elements are
// removed together with their text content by DOMPurify itself), so the
// stored body is plain text with zero HTML tags.
//
// The view (core/views/tickets/show.ejs) additionally renders the body with
// EJS's auto-escaping `<%= %>` (never `<%- %>`) as a second, independent
// layer of defense — belt and suspenders, in case a future edit to the view
// ever swaps back to raw interpolation by mistake.
function sanitize(body) {
  return DOMPurify.sanitize(body, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

class CommentsService {
  /**
   * @param {CommentsRepository} [repository]
   * @param {TicketsService} [ticketsService]
   */
  constructor(repository = new CommentsRepository(), ticketsService = new TicketsService()) {
    this.repository = repository;
    this.ticketsService = ticketsService;
  }

  /**
   * Lists comments for a ticket, enforcing the same ownership rule as
   * viewing the ticket itself (VULN-004/IDOR): a comment thread belonging to
   * someone else's ticket is exactly as invisible as the ticket, same
   * generic 404 (getOwnedTicket already throws that).
   *
   * @param {number} ticketId
   * @param {{ id: number, role: string }} user
   */
  async listForTicket(ticketId, user) {
    await this.ticketsService.getOwnedTicket(ticketId, user);
    return this.repository.listByTicketId(ticketId);
  }

  /**
   * Creates a comment on a ticket, enforcing the same ownership rule as
   * editing the ticket (VULN-004/IDOR) — a non-owner (and non-staff) user
   * gets the same generic 404 an attacker would see trying to view/edit the
   * ticket directly, never a 403 that would confirm the ticket exists.
   *
   * @param {number} ticketId
   * @param {{ id: number, role: string }} user
   * @param {{ body: string }} input
   */
  async create(ticketId, user, input) {
    await this.ticketsService.getOwnedTicket(ticketId, user);

    const sanitizedBody = sanitize(input.body);
    const id = await this.repository.create({ ticketId, authorId: user.id, body: sanitizedBody });
    return this.repository.findById(id);
  }
}

module.exports = { CommentsService, sanitize };
