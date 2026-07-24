/**
 * Typed application error. Use this for any expected/handled failure
 * (validation, auth, not found, forbidden, etc.) so the centralized error
 * handler (src/core/middleware/errorHandler.js) can distinguish operational
 * errors — safe to describe to the client — from programming errors, which
 * must never leak details (message/stack) to the client.
 */
class AppError extends Error {
  /**
   * @param {string} message - Safe to show to the client.
   * @param {number} statusCode - HTTP status code.
   * @param {boolean} isOperational - True for expected/handled failures.
   */
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
