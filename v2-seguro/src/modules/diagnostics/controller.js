const { generateCsrfToken } = require('../../config/csrf');
const { DiagnosticsService } = require('./service');

class DiagnosticsController {
  /**
   * @param {DiagnosticsService} [service]
   */
  constructor(service = new DiagnosticsService()) {
    this.service = service;
  }

  index = (request, response) => {
    // Optional prefill: assets/show.ejs links here with `?target=<ip>` so a
    // technician can jump from an asset's detail page straight into a ping
    // against that asset's stored IP without retyping it. Purely a UI
    // convenience — this value is NOT trusted or executed here; it only
    // pre-populates the form input, and the real validation still runs
    // in full when the form is submitted (modules/diagnostics/validators.js
    // + service.js), so a tampered query string cannot bypass anything.
    const { target } = request.query;

    response.render('diagnostics/index', {
      pingOutput: '',
      healthOutput: '',
      prefillTarget: typeof target === 'string' ? target : '',
      csrfToken: generateCsrfToken(request, response),
    });
  };

  ping = async (request, response, next) => {
    try {
      const { target } = request.body;
      const pingOutput = await this.service.ping(target);
      response.render('diagnostics/index', {
        pingOutput,
        healthOutput: '',
        prefillTarget: target,
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };

  healthCheck = async (request, response, next) => {
    try {
      const { url } = request.body;
      const result = await this.service.healthCheck(url);
      response.render('diagnostics/index', {
        pingOutput: '',
        healthOutput: `HTTP ${result.status}\n${result.body}`,
        prefillTarget: '',
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { DiagnosticsController };
