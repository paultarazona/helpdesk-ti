/**
 * @param { import('knex').Knex } knex
 */
exports.up = function up(knex) {
  return knex.schema.createTable('tickets', (table) => {
    table.increments('id').primary();
    table.string('subject', 200).notNullable();
    table.text('description').notNullable();
    table.string('status', 20).notNullable().defaultTo('open');
    table.string('priority', 20).notNullable().defaultTo('medium');
    table.integer('requester_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.integer('assignee_id').references('id').inTable('users').onDelete('SET NULL');
    table.integer('asset_id').references('id').inTable('assets').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("status IN ('open', 'in_progress', 'closed')", [], 'tickets_status_check');
    table.check("priority IN ('low', 'medium', 'high', 'critical')", [], 'tickets_priority_check');

    table.index('requester_id', 'idx_tickets_requester');
    table.index('assignee_id', 'idx_tickets_assignee');
    table.index('asset_id', 'idx_tickets_asset');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('tickets');
};
