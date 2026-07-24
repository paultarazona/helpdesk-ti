const { generateCsrfToken } = require('../../config/csrf');
const { AppError } = require('../../core/errors/AppError');
const { AssetsService } = require('./service');

/**
 * Parses and validates a route `:id` param as a positive integer. Returns
 * null for anything else (non-numeric, negative, float, etc.) so the
 * caller can respond with the same generic 404 for a malformed id as for a
 * well-formed-but-nonexistent one — mirrors
 * tickets/controller.js#parseId, and mitigates
 * [VULN-001][A03:SQLi][CWE-89]: v1
 * (v1-inseguro/src/modules/assets/routes.js) concatenates
 * `request.params.id` straight into raw SQL (`WHERE a.id = ${id}`), so an
 * id like `1 OR 1=1` reaches the database unchanged.
 */
function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

class AssetsController {
  /**
   * @param {AssetsService} [service]
   */
  constructor(service = new AssetsService()) {
    this.service = service;
  }

  index = async (request, response, next) => {
    try {
      const { search } = request.validatedQuery;
      const assets = await this.service.list({ search });
      response.render('assets/index', { assets, search });
    } catch (error) {
      next(error);
    }
  };

  newForm = async (request, response, next) => {
    try {
      const users = await this.service.listUsersForForm();
      response.render('assets/form', {
        asset: {},
        users,
        action: '/assets',
        heading: 'Nuevo activo',
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (request, response, next) => {
    try {
      const asset = await this.service.create(request.body, request.user.id);
      response.redirect(`/assets/${asset.id}`);
    } catch (error) {
      next(error);
    }
  };

  show = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Asset not found.', 404);

      const asset = await this.service.findOrFail(id);
      const tickets = await this.service.listTicketsForAsset(id);
      response.render('assets/show', { asset, tickets, csrfToken: generateCsrfToken(request, response) });
    } catch (error) {
      next(error);
    }
  };

  editForm = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Asset not found.', 404);

      const asset = await this.service.findOrFail(id);
      const users = await this.service.listUsersForForm();
      response.render('assets/form', {
        asset,
        users,
        action: `/assets/${id}`,
        heading: 'Editar activo',
        csrfToken: generateCsrfToken(request, response),
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Asset not found.', 404);

      await this.service.update(id, request.user, request.body);
      response.redirect(`/assets/${id}`);
    } catch (error) {
      next(error);
    }
  };

  remove = async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      if (id === null) throw new AppError('Asset not found.', 404);

      await this.service.remove(id, request.user);
      response.redirect('/assets');
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { AssetsController, parseId };
