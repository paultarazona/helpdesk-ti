const jwt = require('jsonwebtoken');
const config = require('../../config');

function getCookie(request, name) {
  const cookies = request.headers.cookie || '';
  const entry = cookies.split(';').find((cookie) => cookie.trim().startsWith(`${name}=`));

  return entry ? entry.trim().slice(name.length + 1) : null;
}

function attachUser(request, response, next) {
  const token = getCookie(request, 'token');

  request.user = null;

  if (token) {
    try {
      // [VULN-011][A02:JWT-Insecure][CWE-327] v1 does not restrict accepted algorithms.
      request.user = jwt.verify(token, config.jwtSecret);
    } catch (_error) {
      request.user = null;
    }
  }

  response.locals.user = request.user;
  response.locals.currentPath = request.path;
  next();
}

function requireAuth(request, response, next) {
  if (!request.user) {
    response.redirect('/login');
    return;
  }

  next();
}

module.exports = { attachUser, requireAuth };
