const { exec } = require('node:child_process');
const express = require('express');

function createDiagnosticsRouter(execute = exec, requestUrl = fetch) {
  const router = express.Router();

  router.get('/', (_request, response) => {
    response.render('diagnostics/index', { pingOutput: '', healthOutput: '' });
  });

  router.post('/ping', (request, response, next) => {
    const { target } = request.body;
    // [VULN-007][A03:Command-Injection][CWE-78] The target is concatenated into a shell command in v1.
    execute(`ping -c 1 ${target}`, (error, stdout, stderr) => {
      if (error) {
        next(error);
        return;
      }

      response.render('diagnostics/index', { pingOutput: stdout || stderr, healthOutput: '' });
    });
  });

  router.post('/health-check', async (request, response, next) => {
    try {
      const { url } = request.body;
      // [VULN-008][A10:SSRF][CWE-918] Any user-provided URL is fetched without an allowlist in v1.
      const healthResponse = await requestUrl(url);
      response.render('diagnostics/index', {
        pingOutput: '',
        healthOutput: `HTTP ${healthResponse.status}\n${await healthResponse.text()}`
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createDiagnosticsRouter };
