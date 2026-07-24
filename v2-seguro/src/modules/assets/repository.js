const { db: sharedDb } = require('../../db/connection');

const TABLE = 'assets';

// Only place that talks to the database for this module. Every query below
// is built with Knex's query builder — no string concatenation of user
// input into SQL, in direct contrast with v1
// (v1-inseguro/src/modules/assets/routes.js), which interpolates the
// `search` term and route `:id` params straight into raw query strings
// (VULN-001, SQL Injection).
class AssetsRepository {
  /**
   * @param {import('knex').Knex} [database]
   */
  constructor(database = sharedDb) {
    this.db = database;
  }

  baseSelect() {
    return this.db(`${TABLE} as a`)
      .leftJoin('users as assigned', 'assigned.id', 'a.assigned_to_user_id')
      .leftJoin('users as creator', 'creator.id', 'a.created_by_user_id')
      .select(
        'a.*',
        'assigned.username as assigned_username',
        'creator.username as created_by_username'
      );
  }

  /**
   * @param {{ search?: string }} [filters]
   */
  async list({ search = '' } = {}) {
    const query = this.baseSelect();

    if (search) {
      // `ilike` with bound parameters — Knex never interpolates `search`
      // into the SQL string, so a payload like `'; DROP TABLE assets;--`
      // or `' OR '1'='1` is just an ordinary (non-matching) literal value.
      query.where((builder) => {
        builder.where('a.name', 'ilike', `%${search}%`).orWhere('a.ip_address', 'ilike', `%${search}%`);
      });
    }

    return query.orderBy('a.name');
  }

  async findById(id) {
    const asset = await this.baseSelect().where('a.id', id).first();
    return asset ?? null;
  }

  /**
   * @param {{ name: string, assetType: string, ipAddress?: string, assignedToUserId?: number, createdByUserId?: number }} input
   * @returns {Promise<number>} the created asset's id
   */
  async create({ name, assetType, ipAddress, assignedToUserId, createdByUserId }) {
    const [created] = await this.db(TABLE)
      .insert({
        name,
        asset_type: assetType,
        ip_address: ipAddress ?? null,
        assigned_to_user_id: assignedToUserId ?? null,
        created_by_user_id: createdByUserId ?? null,
      })
      .returning('id');

    return created.id;
  }

  /**
   * @param {number} id
   * @param {{ name?: string, assetType?: string, ipAddress?: string, assignedToUserId?: number }} fields
   */
  async update(id, fields) {
    const updateData = {};

    if (fields.name !== undefined) updateData.name = fields.name;
    if (fields.assetType !== undefined) updateData.asset_type = fields.assetType;
    if (fields.ipAddress !== undefined) updateData.ip_address = fields.ipAddress ?? null;
    if (fields.assignedToUserId !== undefined) updateData.assigned_to_user_id = fields.assignedToUserId ?? null;

    await this.db(TABLE).where({ id }).update(updateData);
    return this.findById(id);
  }

  async delete(id) {
    return this.db(TABLE).where({ id }).del();
  }

  async listUsersForForm() {
    return this.db('users').select('id', 'username').orderBy('username');
  }

  async listTicketsForAsset(assetId) {
    return this.db('tickets')
      .select('id', 'subject', 'status', 'priority')
      .where('asset_id', assetId)
      .orderBy('created_at', 'desc');
  }
}

module.exports = { AssetsRepository };
