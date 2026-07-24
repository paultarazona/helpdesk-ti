const knex = require('knex');
const knexConfig = require('../../knexfile');
const { env } = require('../config/env');

// Single shared Knex instance, reused by future repositories (auth, tickets,
// assets, comments) in the next milestone.
const db = knex(knexConfig[env.NODE_ENV] || knexConfig.development);

async function closeConnection() {
  await db.destroy();
}

module.exports = { db, closeConnection };
