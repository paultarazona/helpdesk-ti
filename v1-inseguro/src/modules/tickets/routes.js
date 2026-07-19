const express = require('express');
const { pool } = require('../../db/connection');

function createTicketsRouter(database = pool) {
  const router = express.Router();

  router.get('/', async (request, response, next) => {
    const { search = '', status = '', priority = '' } = request.query;
    let query = `SELECT t.*, u.username AS requester_username, a.name AS asset_name
      FROM tickets t
      JOIN users u ON u.id = t.requester_id
      LEFT JOIN assets a ON a.id = t.asset_id
      WHERE 1 = 1`;

    // [VULN-001][A03:SQL-Injection][CWE-89] Search and filters are concatenated in v1.
    if (search) query += ` AND (t.subject ILIKE '%${search}%' OR t.description ILIKE '%${search}%')`;
    if (status) query += ` AND t.status = '${status}'`;
    if (priority) query += ` AND t.priority = '${priority}'`;
    query += ' ORDER BY t.created_at DESC';

    try {
      const result = await database.query(query);
      response.render('tickets/index', { tickets: result.rows, search, status, priority });
    } catch (error) {
      next(error);
    }
  });

  router.get('/new', async (_request, response, next) => {
    try {
      const assets = await database.query('SELECT id, name FROM assets ORDER BY name');
      response.render('tickets/form', { ticket: {}, assets: assets.rows, action: '/tickets', heading: 'Create ticket' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    const { subject, description, priority, assetId } = request.body;

    try {
      // [VULN-005][A01:CSRF][CWE-352] This state-changing form has no CSRF token.
      const result = await database.query(
        `INSERT INTO tickets (subject, description, priority, requester_id, asset_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [subject, description, priority, request.user.id, assetId || null]
      );
      response.redirect(`/tickets/${result.rows[0].id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/edit', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] No ownership check is applied before editing by ID.
      const ticket = await database.query(`SELECT * FROM tickets WHERE id = ${request.params.id}`);
      const assets = await database.query('SELECT id, name FROM assets ORDER BY name');

      if (!ticket.rows[0]) {
        response.status(404).send('Ticket not found');
        return;
      }

      response.render('tickets/form', {
        ticket: ticket.rows[0],
        assets: assets.rows,
        action: `/tickets/${request.params.id}`,
        heading: 'Edit ticket'
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id', async (request, response, next) => {
    const { subject, description, status, priority, assetId } = request.body;

    try {
      // [VULN-004][A01:IDOR][CWE-639] Any authenticated user can update an arbitrary ticket ID.
      // [VULN-005][A01:CSRF][CWE-352] No CSRF token is checked.
      await database.query(
        `UPDATE tickets
         SET subject = $1, description = $2, status = $3, priority = $4, asset_id = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [subject, description, status, priority, assetId || null, request.params.id]
      );
      response.redirect(`/tickets/${request.params.id}`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/close', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] No ownership condition is present in the update.
      // [VULN-005][A01:CSRF][CWE-352] No CSRF token is checked.
      await database.query(`UPDATE tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ${request.params.id}`);
      response.redirect(`/tickets/${request.params.id}`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/delete', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] No ownership condition is present in the delete.
      // [VULN-005][A01:CSRF][CWE-352] No CSRF token is checked.
      await database.query(`DELETE FROM tickets WHERE id = ${request.params.id}`);
      response.redirect('/tickets');
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      // [VULN-004][A01:IDOR][CWE-639] Ticket detail is fetched by ID without requester scoping.
      const result = await database.query(`SELECT t.*, u.username AS requester_username, a.name AS asset_name
        FROM tickets t
        JOIN users u ON u.id = t.requester_id
        LEFT JOIN assets a ON a.id = t.asset_id
        WHERE t.id = ${request.params.id}`);
      const ticket = result.rows[0];

      if (!ticket) {
        response.status(404).send('Ticket not found');
        return;
      }

      const comments = await database.query(
        `SELECT c.*, u.username AS author_username
         FROM comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.ticket_id = ${request.params.id}
         ORDER BY c.created_at ASC`,
      );
      const attachments = await database.query(
        `SELECT * FROM ticket_attachments
         WHERE ticket_id = ${request.params.id}
         ORDER BY created_at ASC`,
      );
      response.render('tickets/detail', {
        ticket,
        comments: comments.rows,
        attachments: attachments.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createTicketsRouter };
