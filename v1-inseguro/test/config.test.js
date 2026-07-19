const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const configPath = path.join(__dirname, '..', 'src', 'config.js');

test('runtime environment variables override v1 defaults', () => {
  const originalEnv = { ...process.env };

  process.env.PORT = '3017';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/helpdesk_v1_lab';
  process.env.JWT_SECRET = 'local-test-secret';

  delete require.cache[configPath];
  const config = require(configPath);

  assert.equal(config.port, 3017);
  assert.equal(config.databaseUrl, process.env.DATABASE_URL);
  assert.equal(config.jwtSecret, process.env.JWT_SECRET);

  process.env = originalEnv;
  delete require.cache[configPath];
});
