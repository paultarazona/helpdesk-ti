const express = require('express');
const { pool } = require('../../db/connection');

function createCommentsRouter(database = pool) {
  const router = express.Router();

  router.post('/:ticketId/comments', async (request, response, next) => {
    const { body } = request.body;

    try {
      // [VULN-005][A01:CSRF][CWE-352] Comment creation deliberately accepts requests without a CSRF token.
      await database.query(
        'INSERT INTO comments (ticket_id, author_id, body) VALUES ($1, $2, $3)',
        [request.params.ticketId, request.user.id, body]
      );
      response.redirect(`/tickets/${request.params.ticketId}`);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createCommentsRouter };
