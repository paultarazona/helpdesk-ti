const { db: sharedDb } = require('../../db/connection');

const TABLE = 'users';

// Only place that talks to the database for this module. Every query below
// is built with Knex's query builder — no string concatenation of user
// input into SQL, in direct contrast with v1 (src/modules/auth/routes.js),
// which interpolates username/password straight into a raw query string
// (VULN-001, SQL Injection).
class AuthRepository {
  /**
   * @param {import('knex').Knex} [database]
   */
  constructor(database = sharedDb) {
    this.db = database;
  }

  /**
   * Returns the full row (including password_hash) so the service layer can
   * verify the password. Never expose this row directly outside the
   * service boundary.
   */
  async findByUsername(username) {
    const user = await this.db(TABLE).where({ username }).first();
    return user ?? null;
  }

  async findByEmail(email) {
    const user = await this.db(TABLE).where({ email }).first();
    return user ?? null;
  }

  /**
   * @param {{ username: string, email: string, passwordHash: string, role: string }} user
   * @returns {Promise<{ id: number, username: string, email: string, role: string }>}
   */
  async create(user) {
    const [created] = await this.db(TABLE)
      .insert({
        username: user.username,
        email: user.email,
        password_hash: user.passwordHash,
        role: user.role,
      })
      .returning(['id', 'username', 'email', 'role']);

    return created;
  }
}

module.exports = { AuthRepository };
