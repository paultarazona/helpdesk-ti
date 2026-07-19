const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// [VULN-013][A02:Hardcoded-Secrets][CWE-798] Defaults stay fixed for v1.
module.exports = {
  port: Number.parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://helpdesk:helpdesk_password@postgres:5432/helpdesk',
  // [VULN-011][A02:JWT-Insecure][CWE-798] v1 keeps the signing secret in source code.
  jwtSecret: process.env.JWT_SECRET || 'v1-helpdesk-jwt-secret'
};
