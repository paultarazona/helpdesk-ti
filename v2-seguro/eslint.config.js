const js = require('@eslint/js');

// Flat config (eslint.config.js) rather than the legacy .eslintrc format:
// v1-inseguro has no linter at all to be consistent with, and flat config
// is ESLint's current default/recommended format for new projects (ESLint
// v9+), so there is no legacy config to stay consistent with either.
module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'coverage/'],
  },
];
