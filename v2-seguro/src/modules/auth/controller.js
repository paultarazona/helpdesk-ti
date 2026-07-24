const { generateCsrfToken } = require('../../config/csrf');
const { env } = require('../../config/env');
const { AppError } = require('../../core/errors/AppError');
const { AuthService } = require('./service');

// JWT_EXPIRES_IN is a jsonwebtoken-style duration string ('15m', '1h', '7d',
// or a bare number of seconds). Parsed here (rather than pulling in an extra
// dependency) purely to size the cookie's maxAge so the cookie never
// outlives the token it carries.
const DURATION_UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

function parseDurationToMs(duration, fallbackMs) {
  if (typeof duration === 'number') {
    return duration * 1000;
  }

  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(duration).trim());
  if (!match) {
    return fallbackMs;
  }

  const [, amount, unit] = match;
  const unitMs = unit ? DURATION_UNIT_MS[unit.toLowerCase()] : 1000;
  return Number.parseInt(amount, 10) * unitMs;
}

const TOKEN_COOKIE_MAX_AGE_MS = parseDurationToMs(env.JWT_EXPIRES_IN, 15 * 60 * 1000);

function setTokenCookie(response, token) {
  // Hardened contrast with v1 (VULN-011): v1 sets the cookie with no
  // options at all (`response.cookie('token', token)`). v2 sets it
  // httpOnly (not readable via document.cookie / XSS), secure in
  // production, sameSite strict (CSRF-hardening belt-and-suspenders on top
  // of the csrf-csrf token), and a maxAge matching the JWT's own
  // expiration so the cookie can't outlive the token.
  response.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_COOKIE_MAX_AGE_MS,
  });
}

class AuthController {
  /**
   * @param {AuthService} [service]
   */
  constructor(service = new AuthService()) {
    this.service = service;
  }

  showRegisterForm = (request, response) => {
    const csrfToken = generateCsrfToken(request, response);
    response.render('auth/register', { csrfToken, error: undefined });
  };

  registerSubmit = async (request, response, next) => {
    try {
      await this.service.register(request.body);
      // v1 redirects to /login after a successful registration.
      response.redirect('/login');
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) {
        // SSR-friendly UX matching v1: render the form again with an inline
        // error instead of a JSON error payload, for this expected/handled
        // failure. Unexpected errors still fall through to next(error) and
        // the JSON error handler.
        const csrfToken = generateCsrfToken(request, response);
        response.status(409).render('auth/register', { csrfToken, error: error.message });
        return;
      }

      next(error);
    }
  };

  showLoginForm = (request, response) => {
    const csrfToken = generateCsrfToken(request, response);
    response.render('auth/login', { csrfToken, error: undefined });
  };

  loginSubmit = async (request, response, next) => {
    try {
      const { token } = await this.service.login(request.body);
      setTokenCookie(response, token);
      // /dashboard does not exist yet in v2-seguro (no `tickets`/dashboard
      // module implemented at the time of writing). Redirecting here
      // matches v1's intended UX; the target route itself is out of scope
      // for the auth module and will be wired up by whichever module
      // implements the dashboard.
      response.redirect('/dashboard');
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        // SSR-friendly UX matching v1: render the login view again with
        // status 401 and an inline error, not a JSON error.
        const csrfToken = generateCsrfToken(request, response);
        response.status(401).render('auth/login', { csrfToken, error: error.message });
        return;
      }

      next(error);
    }
  };

  logout = (_request, response) => {
    response.clearCookie('token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.redirect('/login');
  };
}

module.exports = { AuthController, parseDurationToMs };
