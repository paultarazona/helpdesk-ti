const path = require('node:path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const pinoHttp = require('pino-http');
const { corsOptions } = require('./config/cors');
const { helmetMiddleware } = require('./config/helmet');
const { attachUser, requireAuth } = require('./core/middleware/authMiddleware');
const { errorHandler } = require('./core/middleware/errorHandler');
const { generalLimiter } = require('./core/middleware/rateLimiter');
const { logger } = require('./core/logger');
const { createAuthRouter } = require('./modules/auth/routes');
const { createTicketsRouter } = require('./modules/tickets/routes');
const { createAssetsRouter } = require('./modules/assets/routes');
const { createCommentsRouter } = require('./modules/comments/routes');
const { createAttachmentsRouter } = require('./modules/attachments/routes');
const { createDiagnosticsRouter } = require('./modules/diagnostics/routes');

const app = express();

app.set('view engine', 'ejs');
// Per docs/plan-mesa-ayuda-ti.md §5: shared layouts/partials live under
// core/views/. Module-specific views will be added under
// core/views/<module>/ as each module is implemented.
app.set('views', path.join(__dirname, 'core', 'views'));

// Hardened contrast with v1 (VULN-012): helmet + restricted CORS are
// applied from the very first middleware, before parsers or routes.
app.use(helmetMiddleware);
app.use(cors(corsOptions));
app.use(pinoHttp({ logger }));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cookieParser());

app.use(generalLimiter);
app.use(attachUser);

app.use(createAuthRouter());

// /dashboard is the auth module's post-login redirect target
// (modules/auth/controller.js). The tickets list IS the dashboard for this
// app (§6 of docs/plan-mesa-ayuda-ti.md), so it's aliased here rather than
// duplicated as its own view.
app.get('/dashboard', requireAuth, (_request, response) => {
  response.redirect('/tickets');
});

app.use('/tickets', createTicketsRouter());
app.use('/tickets', createCommentsRouter());
app.use('/tickets', createAttachmentsRouter());
app.use('/assets', createAssetsRouter());
app.use('/diagnostics', requireAuth, createDiagnosticsRouter());

// Centralized error handler — must be the LAST middleware registered.
app.use(errorHandler);

module.exports = app;
