require('dotenv').config();

// Discrete connection params (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD)
// instead of a single connection string, so knex's own connection pooling
// and SSL options can be configured per key without string parsing.
const baseConnection = {
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

/** @type { import('knex').Knex.Config } */
const development = {
  client: 'pg',
  connection: baseConnection,
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

/** @type { import('knex').Knex.Config } */
const production = {
  client: 'pg',
  connection: {
    ...baseConnection,
    ssl: { rejectUnauthorized: false },
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  pool: { min: 2, max: 10 },
};

const test = {
  ...development,
  connection: {
    ...baseConnection,
    database: process.env.DB_NAME ? `${process.env.DB_NAME}_test` : undefined,
  },
};

module.exports = { development, production, test };
