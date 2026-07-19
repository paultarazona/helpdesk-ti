const express = require('express');
const { pool } = require('../../db/connection');

function createAdminRouter(database = pool) {
  const router = express.Router();

  router.get('/', async (_request, response, next) => {
    try {
      // [VULN-014][A01:Broken-Access-Control][CWE-285] Authentication is required, but no admin role check is applied.
      const users = await database.query('SELECT id, username, email, role FROM users ORDER BY id');
      response.render('admin/index', { users: users.rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminRouter };
