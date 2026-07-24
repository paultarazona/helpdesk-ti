const { AppError } = require('../../core/errors/AppError');
const { AssetsRepository } = require('./repository');

// Generic "not found" message/status, mirroring tickets/service.js's IDOR
// mitigation pattern for malformed/nonexistent ids — but NOT a per-user
// ownership restriction. Assets are shared IT inventory: v1
// (v1-inseguro/src/modules/assets/routes.js) lists ALL assets to any
// authenticated user and looks up any asset by id with no ownership check
// on view/edit/delete at all (its `[VULN-004][A01:IDOR]` comments there
// flag the raw, unvalidated `:id` concatenated into SQL — fixed here via
// Knex bound parameters + integer id parsing in the controller — not a
// missing "only the owner can see this" rule). Unlike tickets, there is no
// requester-like ownership concept for assets to enforce, so any
// authenticated user (any role) may view/create/edit/delete any asset,
// matching v1's actual behavior.
const NOT_FOUND_MESSAGE = 'Asset not found.';

class AssetsService {
  /**
   * @param {AssetsRepository} [repository]
   */
  constructor(repository = new AssetsRepository()) {
    this.repository = repository;
  }

  async list(filters) {
    return this.repository.list(filters);
  }

  async listUsersForForm() {
    return this.repository.listUsersForForm();
  }

  async listTicketsForAsset(assetId) {
    return this.repository.listTicketsForAsset(assetId);
  }

  /**
   * @param {{ name: string, assetType: string, ipAddress?: string, assignedToUserId?: number }} input
   * @param {number} createdByUserId
   */
  async create(input, createdByUserId) {
    const id = await this.repository.create({ ...input, createdByUserId });
    return this.repository.findById(id);
  }

  /**
   * Fetches an asset by id, throwing a generic 404 if it does not exist.
   * No ownership check — see class-level comment.
   */
  async findOrFail(id) {
    const asset = await this.repository.findById(id);

    if (!asset) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    return asset;
  }

  async update(id, _user, input) {
    await this.findOrFail(id);
    return this.repository.update(id, input);
  }

  async remove(id, _user) {
    await this.findOrFail(id);
    await this.repository.delete(id);
  }
}

module.exports = { AssetsService, NOT_FOUND_MESSAGE };
