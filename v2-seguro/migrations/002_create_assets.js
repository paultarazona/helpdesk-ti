/**
 * @param { import('knex').Knex } knex
 */
exports.up = function up(knex) {
  return knex.schema.createTable('assets', (table) => {
    table.increments('id').primary();
    table.string('name', 120).notNullable();
    table.string('asset_type', 40).notNullable();
    table.string('ip_address', 45);
    table.integer('assigned_to_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.integer('created_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check(
      "asset_type IN ('server', 'laptop', 'switch', 'router', 'printer')",
      [],
      'assets_asset_type_check'
    );

    table.index('assigned_to_user_id', 'idx_assets_assigned_to_user');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('assets');
};
