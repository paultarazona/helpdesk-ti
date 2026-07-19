const jwt = require('jsonwebtoken');
const config = require('../../config');

function getCookie(request, name) {
  const cookies = request.headers.cookie || '';
  const entry = cookies.split(';').find((cookie) => cookie.trim().startsWith(`${name}=`));

  return entry ? entry.trim().slice(name.length + 1) : null;
}

function requireAuth(request, response, next) {
  const token = getCookie(request, 'token');

  if (!token) {
    response.redirect('/login');
    return;
  }

  try {
    // [VULN-011][A02:JWT-Insecure][CWE-327] v1 does not restrict accepted algorithms.
    request.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch (_error) {
    response.redirect('/login');
  }
}

module.exports = { requireAuth };
