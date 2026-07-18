const app = require('./app');
const config = require('./config');
const { closePool } = require('./db/connection');

const server = app.listen(config.port, () => {
  console.log(`IT Helpdesk v1 listening on port ${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
