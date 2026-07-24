const { db: sharedDb } = require('../../db/connection');

const TABLE = 'attachments';

// Only place that talks to the database for this module. Same convention as
// tickets/repository.js and comments/repository.js: every query is built
// with Knex's query builder — no string concatenation of user input into
// SQL.
class AttachmentsRepository {
  /**
   * @param {import('knex').Knex} [database]
   */
  constructor(database = sharedDb) {
    this.db = database;
  }

  /**
   * @param {{ ticketId: number, uploadedBy: number, originalFilename: string, storedFilename: string, mimeType: string, sizeBytes: number }} input
   * @returns {Promise<number>} the created attachment's id
   */
  async create({ ticketId, uploadedBy, originalFilename, storedFilename, mimeType, sizeBytes }) {
    const [created] = await this.db(TABLE)
      .insert({
        ticket_id: ticketId,
        uploaded_by: uploadedBy,
        original_filename: originalFilename,
        stored_filename: storedFilename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
      })
      .returning('id');

    return created.id;
  }

  async findById(id) {
    const attachment = await this.db(TABLE).where({ id }).first();
    return attachment ?? null;
  }

  /**
   * @param {number} ticketId
   */
  async listByTicketId(ticketId) {
    return this.db(TABLE).where({ ticket_id: ticketId }).orderBy('created_at', 'asc');
  }

  async delete(id) {
    return this.db(TABLE).where({ id }).del();
  }
}

module.exports = { AttachmentsRepository };
