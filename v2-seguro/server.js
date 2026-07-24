const app = require('./src/app');
const { env } = require('./src/config/env');
const { db, closeConnection } = require('./src/db/connection');
const { logger } = require('./src/core/logger');

// Liveness: process is up and can respond. Does not touch the database.
app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

// Readiness: process is up AND its dependencies (Postgres) are reachable.
// Hardened contrast with v1 (which has no /ready check) — lets
// docker-compose/CI know when the app can actually serve traffic.
app.get('/ready', async (_request, response) => {
  try {
    await db.raw('SELECT 1');
    response.status(200).json({ status: 'ready' });
  } catch (error) {
    logger.error({ err: error }, 'Readiness check failed: database unreachable');
    response.status(503).json({ status: 'not ready' });
  }
});

const server = app.listen(env.PORT, () => {
  logger.info(`IT Helpdesk v2 (hardened) listening on port ${env.PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await closeConnection();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
