/**
 * @param { import('knex').Knex } knex
 */
exports.up = function up(knex) {
  return knex.schema.createTable('comments', (table) => {
    table.increments('id').primary();
    table.integer('ticket_id').notNullable().references('id').inTable('tickets').onDelete('CASCADE');
    table.integer('author_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.text('body').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('ticket_id', 'idx_comments_ticket');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('comments');
};
