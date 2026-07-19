// [VULN-013][A02:Hardcoded-Secrets][CWE-798] Values are intentionally fixed for v1.
module.exports = {
  port: 3000,
  databaseUrl: 'postgres://helpdesk:helpdesk_password@postgres:5432/helpdesk',
  // [VULN-011][A02:JWT-Insecure][CWE-798] v1 keeps the signing secret in source code.
  jwtSecret: 'v1-helpdesk-jwt-secret'
};
