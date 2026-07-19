const express = require('express');
const { pool } = require('../../db/connection');

function createAssetsRouter(database = pool) {
  const router = express.Router();

  async function getUsers() {
    const result = await database.query('SELECT id, username FROM users ORDER BY username');
    return result.rows;
  }

  router.get('/', async (request, response, next) => {
    const { search = '' } = request.query;
    let query = `SELECT a.*, assigned.username AS assigned_username, creator.username AS created_by_username
      FROM assets a
      LEFT JOIN users assigned ON assigned.id = a.assigned_to_user_id
      LEFT JOIN users creator ON creator.id = a.created_by_user_id
      WHERE 1 = 1`;

    // [VULN-001][A03:SQL-Injection][CWE-89] The asset search is deliberately concatenated in v1.
    if (search) query += ` AND (a.name ILIKE '%${search}%' OR a.ip_address ILIKE '%${search}%')`;
    query += ' ORDER BY a.name';

    try {
      const result = await database.query(query);
      response.render('assets/index', { assets: result.rows, search });
    } catch (error) {
      next(error);
    }
  });

  router.get('/new', async (_request, response, next) => {
    try {
      response.render('assets/form', {
        asset: {},
        users: await getUsers(),
        action: '/assets',
        heading: 'Create asset'
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    const { name, assetType, ipAddress, assignedToUserId } = request.body;

    try {
      const result = await database.query(
        `INSERT INTO assets (name, asset_type, ip_address, assigned_to_user_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, assetType, ipAddress || null, assignedToUserId || null, request.user.id]
      );
      response.redirect(`/assets/${result.rows[0].id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/edit', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] Any authenticated user may edit an asset by ID.
      const result = await database.query(
        `SELECT a.* FROM assets a WHERE a.id = ${request.params.id}`
      );

      if (!result.rows[0]) {
        response.status(404).send('Asset not found');
        return;
      }

      response.render('assets/form', {
        asset: result.rows[0],
        users: await getUsers(),
        action: `/assets/${request.params.id}`,
        heading: 'Edit asset'
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id', async (request, response, next) => {
    const { name, assetType, ipAddress, assignedToUserId } = request.body;

    try {
      // [VULN-004][A01:IDOR][CWE-639] The update is not constrained to the asset owner.
      await database.query(
        `UPDATE assets
         SET name = $1, asset_type = $2, ip_address = $3, assigned_to_user_id = $4
         WHERE id = $5`,
        [name, assetType, ipAddress || null, assignedToUserId || null, request.params.id]
      );
      response.redirect(`/assets/${request.params.id}`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/delete', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] Any authenticated user can delete an arbitrary asset ID.
      await database.query(`DELETE FROM assets WHERE id = ${request.params.id}`);
      response.redirect('/assets');
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] Asset details are deliberately not scoped to its assigned user.
      const result = await database.query(
        `SELECT a.*, assigned.username AS assigned_username, creator.username AS created_by_username
         FROM assets a
         LEFT JOIN users assigned ON assigned.id = a.assigned_to_user_id
         LEFT JOIN users creator ON creator.id = a.created_by_user_id
         WHERE a.id = ${request.params.id}`
      );
      const asset = result.rows[0];

      if (!asset) {
        response.status(404).send('Asset not found');
        return;
      }

      const tickets = await database.query(
        `SELECT id, subject, status, priority FROM tickets WHERE asset_id = ${request.params.id} ORDER BY created_at DESC`
      );
      response.render('assets/detail', { asset, tickets: tickets.rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAssetsRouter };
