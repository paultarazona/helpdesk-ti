const { db: sharedDb } = require('../../db/connection');

const TABLE = 'comments';

// Only place that talks to the database for this module. Same convention as
// tickets/repository.js: every query is built with Knex's query builder —
// no string concatenation of user input into SQL.
class CommentsRepository {
  /**
   * @param {import('knex').Knex} [database]
   */
  constructor(database = sharedDb) {
    this.db = database;
  }

  baseSelect() {
    return this.db(`${TABLE} as c`).join('users as u', 'u.id', 'c.author_id').select('c.*', 'u.username as author_username');
  }

  /**
   * @param {number} ticketId
   */
  async listByTicketId(ticketId) {
    return this.baseSelect().where('c.ticket_id', ticketId).orderBy('c.created_at', 'asc');
  }

  async findById(id) {
    const comment = await this.baseSelect().where('c.id', id).first();
    return comment ?? null;
  }

  /**
   * @param {{ ticketId: number, authorId: number, body: string }} input
   * @returns {Promise<number>} the created comment's id
   */
  async create({ ticketId, authorId, body }) {
    const [created] = await this.db(TABLE)
      .insert({ ticket_id: ticketId, author_id: authorId, body })
      .returning('id');

    return created.id;
  }
}

module.exports = { CommentsRepository };
