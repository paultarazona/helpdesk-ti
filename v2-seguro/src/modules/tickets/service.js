const { AppError } = require('../../core/errors/AppError');
const { TicketsRepository } = require('./repository');

// Roles allowed to view/edit/delete any ticket, not just their own.
// Mirrors the roles defined by the users table's CHECK constraint
// (migrations/001_create_users.js): 'user', 'agent', 'admin'.
const STAFF_ROLES = new Set(['agent', 'admin']);

// Same generic message/status for "does not exist" and "exists but you
// don't own it" — mitigates [VULN-004][A01:IDOR][CWE-639]. v1
// (v1-inseguro/src/modules/tickets/routes.js) fetches/updates/deletes a
// ticket by id with zero ownership check at all, so any authenticated user
// can view/edit/close/delete any other user's ticket just by changing the
// id in the URL. Returning a 403 here instead of 404 would still leak
// "this id exists, you're just not allowed to see it" — a 404 leaks
// nothing about whether the ticket exists.
const NOT_FOUND_MESSAGE = 'Ticket not found.';

class TicketsService {
  /**
   * @param {TicketsRepository} [repository]
   */
  constructor(repository = new TicketsRepository()) {
    this.repository = repository;
  }

  async list(filters) {
    return this.repository.list(filters);
  }

  async listAssetsForForm() {
    return this.repository.listAssetsForForm();
  }

  /**
   * @param {{ subject: string, description: string, priority: string, status: string, assetId?: number }} input
   * @param {number} requesterId
   */
  async create(input, requesterId) {
    const id = await this.repository.create({ ...input, requesterId });
    return this.repository.findById(id);
  }

  /**
   * @param {{ id: number, requester_id: number } | null} ticket
   * @param {{ id: number, role: string }} user
   */
  canAccess(ticket, user) {
    if (!ticket) return false;
    if (STAFF_ROLES.has(user.role)) return true;
    return ticket.requester_id === user.id;
  }

  /**
   * Fetches a ticket for viewing/editing, enforcing the ownership rule.
   * Throws the same generic 404 whether the ticket doesn't exist or exists
   * but belongs to someone else.
   */
  async getOwnedTicket(id, user) {
    const ticket = await this.repository.findById(id);

    if (!this.canAccess(ticket, user)) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    return ticket;
  }

  async update(id, user, input) {
    const ticket = await this.getOwnedTicket(id, user);
    return this.repository.update(ticket.id, input);
  }

  async close(id, user) {
    return this.update(id, user, { status: 'closed' });
  }

  async remove(id, user) {
    const ticket = await this.getOwnedTicket(id, user);
    await this.repository.delete(ticket.id);
  }
}

module.exports = { TicketsService, STAFF_ROLES, NOT_FOUND_MESSAGE };
