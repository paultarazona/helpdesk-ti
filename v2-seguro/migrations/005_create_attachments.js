/**
 * Mitigates [VULN-006][A05:Unrestricted-Upload][CWE-434] — v1
 * (v1-inseguro/src/modules/attachments/routes.js) has no attachments
 * table at all: it writes the file straight to disk using either the
 * client-supplied `storagePath` or the original filename, and stores just
 * enough metadata (original_name, storage_path, content_type, size_bytes)
 * to serve it back from `public/uploads`. That storage_path is exactly
 * what enables path traversal in v1.
 *
 * v2 never persists a client-controlled path: `stored_filename` is always
 * a server-generated UUID + extension derived from the *detected* MIME
 * type (see modules/attachments/service.js), and the original client
 * filename is kept only as display metadata, never used to build a
 * filesystem path.
 *
 * @param { import('knex').Knex } knex
 */
exports.up = function up(knex) {
  return knex.schema.createTable('attachments', (table) => {
    table.increments('id').primary();
    table.integer('ticket_id').notNullable().references('id').inTable('tickets').onDelete('CASCADE');
    table.integer('uploaded_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    // Original client-supplied filename — metadata only, shown in the UI,
    // NEVER used to build a filesystem path (that's the whole point of
    // VULN-006's mitigation: path traversal is impossible by construction
    // because the on-disk name is always a server-generated UUID).
    table.string('original_filename', 255).notNullable();
    // Server-generated UUID + extension derived from the real detected
    // MIME type (magic bytes), e.g. "b3f1...-4c2e....png". Unique because
    // it is also the on-disk filename under storage/attachments/.
    table.string('stored_filename', 255).notNullable().unique();
    table.string('mime_type', 100).notNullable();
    table.integer('size_bytes').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('ticket_id', 'idx_attachments_ticket');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('attachments');
};
