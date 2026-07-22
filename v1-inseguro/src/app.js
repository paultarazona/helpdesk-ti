const path = require('node:path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const express = require('express');
const i18n = require('i18n');
const { attachUser, requireAuth } = require('./core/middleware/auth');
const { createAttachmentsRouter } = require('./modules/attachments/routes');
const { createAdminRouter } = require('./modules/admin/routes');
const { createAuthRouter } = require('./modules/auth/routes');
const { createAssetsRouter } = require('./modules/assets/routes');
const { createCommentsRouter } = require('./modules/comments/routes');
const { createDiagnosticsRouter } = require('./modules/diagnostics/routes');
const { createTicketsRouter } = require('./modules/tickets/routes');

i18n.configure({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  directory: path.join(__dirname, 'locales'),
  cookie: 'lang',
  queryParameter: 'lang',
  objectNotation: true,
  autoReload: true,
  updateFiles: false,
  syncFiles: false,
});

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cookieParser());
app.use(i18n.init);
app.use((request, response, next) => {
  response.locals.__ = request.__.bind(request);
  response.locals.locale = request.getLocale();
  next();
});

// [VULN-012][A05:Security-Misconfiguration][CWE-942] v1 accepts every origin.
app.use(cors({ origin: '*' }));
app.use(attachUser);

app.get('/lang/:code', (request, response) => {
  const code = ['en', 'es'].includes(request.params.code) ? request.params.code : 'en';
  response.cookie('lang', code, { maxAge: 365 * 24 * 60 * 60 * 1000 });

  let redirectTo = '/dashboard';
  const referer = request.get('Referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === request.get('host')) {
        redirectTo = refererUrl.pathname + refererUrl.search;
      }
    } catch (_error) {
      // Ignore malformed Referer headers and fall back to /dashboard.
    }
  }

  response.redirect(redirectTo);
});

app.use(createAuthRouter());
app.use('/admin', requireAuth, createAdminRouter());
app.use('/assets', requireAuth, createAssetsRouter());
app.use('/tickets', requireAuth, createAttachmentsRouter());
app.use('/tickets', requireAuth, createCommentsRouter());
app.use('/tickets', requireAuth, createTicketsRouter());
app.use('/diagnostics', requireAuth, createDiagnosticsRouter());

app.get('/', (_request, response) => {
  response.redirect('/login');
});

app.get('/dashboard', requireAuth, (_request, response) => {
  response.render('dashboard');
});

// [VULN-012][A05:Security-Misconfiguration][CWE-209] v1 exposes error details to the client.
app.use((error, _request, response, _next) => {
  response.status(500).type('text').send(error.stack);
});

module.exports = app;
