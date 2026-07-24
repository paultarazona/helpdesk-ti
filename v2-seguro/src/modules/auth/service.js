const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { AppError } = require('../../core/errors/AppError');
const { AuthRepository } = require('./repository');

// Hardened contrast with v1 (VULN-010): v1 stores the raw password. v2 only
// ever persists a bcrypt hash, at exactly 12 rounds (decided in
// docs/plan-mesa-ayuda-ti.md), and never returns the hash (or the raw
// password) past this service boundary.
const BCRYPT_ROUNDS = 12;

// Hardened contrast with v1 (VULN-011): algorithm is pinned explicitly on
// both sign (here) and verify (core/middleware/authMiddleware.js) so the
// token's own header can never dictate which algorithm is used to check its
// signature. Expiration comes from env (JWT_EXPIRES_IN, default 15m) so
// tokens can't be replayed indefinitely.
const JWT_ALGORITHM = 'HS256';

// Generic message shared by "user not found" and "wrong password" so the
// endpoint does not leak which usernames exist (no user enumeration via
// response content).
const INVALID_CREDENTIALS_MESSAGE = 'Invalid username or password.';

function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

class AuthService {
  /**
   * @param {AuthRepository} [repository]
   */
  constructor(repository = new AuthRepository()) {
    this.repository = repository;
  }

  /**
   * @param {{ username: string, email: string, password: string }} input
   */
  async register(input) {
    const { username, email, password } = input;

    const existingByUsername = await this.repository.findByUsername(username);
    if (existingByUsername) {
      throw new AppError('That username is already taken.', 409);
    }

    const existingByEmail = await this.repository.findByEmail(email);
    if (existingByEmail) {
      throw new AppError('That email is already registered.', 409);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Role is always hardcoded here, never taken from client input
    // (mitigates [VULN-014][A01:CWE-285], broken RBAC) — registerSchema
    // also rejects a client-supplied `role` field outright as a second
    // layer of defense.
    const created = await this.repository.create({
      username,
      email,
      passwordHash,
      role: 'user',
    });

    return toSafeUser(created);
  }

  /**
   * @param {{ username: string, password: string }} input
   */
  async login(input) {
    const { username, password } = input;

    // Knex query builder only inside the repository — no string
    // concatenation of user input into SQL, in direct contrast with v1's
    // VULN-001. Whatever the caller sends (including a classic
    // `' OR '1'='1` payload) is passed through as an ordinary bound
    // parameter and simply won't match any row.
    const user = await this.repository.findByUsername(username);

    if (!user) {
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const safeUser = toSafeUser(user);

    const token = jwt.sign({ id: safeUser.id, username: safeUser.username, role: safeUser.role }, env.JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      expiresIn: env.JWT_EXPIRES_IN,
    });

    return { token, user: safeUser };
  }
}

module.exports = { AuthService, BCRYPT_ROUNDS, JWT_ALGORITHM, INVALID_CREDENTIALS_MESSAGE };
