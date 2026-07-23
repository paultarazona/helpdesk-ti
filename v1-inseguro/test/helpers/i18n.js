const path = require('node:path');
const i18n = require('i18n');

i18n.configure({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  directory: path.join(__dirname, '..', '..', 'src', 'locales'),
  cookie: 'lang',
  queryParameter: 'lang',
  objectNotation: true,
  autoReload: false,
  updateFiles: false,
  syncFiles: false,
});

function useI18n(app) {
  app.use(i18n.init);
  app.use((request, response, next) => {
    response.locals.__ = request.__.bind(request);
    response.locals.locale = request.getLocale();
    next();
  });
}

module.exports = { useI18n };
