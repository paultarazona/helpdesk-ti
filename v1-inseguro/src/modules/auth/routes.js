const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { pool } = require('../../db/connection');

function createAuthRouter(database = pool) {
  const router = express.Router();

  router.get('/register', (_request, response) => {
    response.render('auth/register');
  });

  router.post('/register', async (request, response, next) => {
    const { username, email, password } = request.body;

    try {
      // [VULN-009][A07:Authentication-Failures][CWE-521] v1 has no password policy.
      // [VULN-010][A02:Plaintext-Passwords][CWE-256] Password is persisted without hashing.
      await database.query(
        "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, 'user') RETURNING id",
        [username, email, password]
      );
      response.redirect('/login');
    } catch (error) {
      next(error);
    }
  });

  router.get('/login', (_request, response) => {
    response.render('auth/login');
  });

  router.post('/login', async (request, response, next) => {
    const { username, password } = request.body;

    try {
      // [VULN-001][A03:SQL-Injection][CWE-89] User input is intentionally concatenated in v1.
      const query = `SELECT id, username, role FROM users WHERE username = '${username}' AND password = '${password}'`;
      const result = await database.query(query);
      const user = result.rows[0];

      if (!user) {
        response.status(401).render('auth/login', { error: request.__('auth.invalidCredentials') });
        return;
      }

      // [VULN-011][A02:JWT-Insecure][CWE-613] v1 tokens have no expiration or explicit algorithm.
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret);
      response.cookie('token', token);
      response.redirect('/dashboard');
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (_request, response) => {
    response.clearCookie('token');
    response.redirect('/login');
  });

  return router;
}

module.exports = { createAuthRouter };
