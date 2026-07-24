/**
 * @param { import('knex').Knex } knex
 */
exports.up = function up(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username', 50).notNullable().unique();
    table.string('email', 255).notNullable().unique();
    // Hardened contrast with v1: v1 stores `password` in plain text
    // (VULN-010). v2 only ever stores a bcrypt hash, never the raw password.
    table.text('password_hash').notNullable();
    table.string('role', 20).notNullable().defaultTo('user');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("role IN ('user', 'agent', 'admin')", [], 'users_role_check');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('users');
};
