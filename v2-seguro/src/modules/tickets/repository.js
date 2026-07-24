const { db: sharedDb } = require('../../db/connection');

const TABLE = 'tickets';

// Only place that talks to the database for this module. Every query below
// is built with Knex's query builder — no string concatenation of user
// input into SQL, in direct contrast with v1
// (v1-inseguro/src/modules/tickets/routes.js), which interpolates
// search/status/priority/id straight into raw query strings
// (VULN-001, SQL Injection, several subtypes: boolean-based via the search
// box, and IDOR-adjacent unguarded id lookups).
class TicketsRepository {
  /**
   * @param {import('knex').Knex} [database]
   */
  constructor(database = sharedDb) {
    this.db = database;
  }

  baseSelect() {
    return this.db(`${TABLE} as t`)
      .join('users as u', 'u.id', 't.requester_id')
      .leftJoin('assets as a', 'a.id', 't.asset_id')
      .select('t.*', 'u.username as requester_username', 'a.name as asset_name');
  }

  /**
   * @param {{ search?: string, status?: string, priority?: string }} [filters]
   */
  async list({ search = '', status = '', priority = '' } = {}) {
    const query = this.baseSelect();

    if (search) {
      // `ilike` with a bound parameter — Knex never interpolates `search`
      // into the SQL string, so a payload like `'; DROP TABLE tickets;--`
      // or `' OR '1'='1` is just an ordinary (non-matching) literal value.
      query.where((builder) => {
        builder.where('t.subject', 'ilike', `%${search}%`).orWhere('t.description', 'ilike', `%${search}%`);
      });
    }

    if (status) {
      query.where('t.status', status);
    }

    if (priority) {
      query.where('t.priority', priority);
    }

    return query.orderBy('t.created_at', 'desc');
  }

  async findById(id) {
    const ticket = await this.baseSelect().where('t.id', id).first();
    return ticket ?? null;
  }

  /**
   * @param {{ subject: string, description: string, priority: string, status: string, requesterId: number, assetId?: number }} input
   * @returns {Promise<number>} the created ticket's id
   */
  async create({ subject, description, priority, status, requesterId, assetId }) {
    const [created] = await this.db(TABLE)
      .insert({
        subject,
        description,
        priority,
        status,
        requester_id: requesterId,
        asset_id: assetId ?? null,
      })
      .returning('id');

    return created.id;
  }

  /**
   * @param {number} id
   * @param {{ subject?: string, description?: string, status?: string, priority?: string, assetId?: number }} fields
   */
  async update(id, fields) {
    const updateData = { updated_at: this.db.fn.now() };

    if (fields.subject !== undefined) updateData.subject = fields.subject;
    if (fields.description !== undefined) updateData.description = fields.description;
    if (fields.status !== undefined) updateData.status = fields.status;
    if (fields.priority !== undefined) updateData.priority = fields.priority;
    if (fields.assetId !== undefined) updateData.asset_id = fields.assetId ?? null;

    await this.db(TABLE).where({ id }).update(updateData);
    return this.findById(id);
  }

  async delete(id) {
    return this.db(TABLE).where({ id }).del();
  }

  async listAssetsForForm() {
    return this.db('assets').select('id', 'name').orderBy('name');
  }
}

module.exports = { TicketsRepository };
