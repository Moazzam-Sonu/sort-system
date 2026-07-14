import js from '@eslint/js';

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  Intl: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
};

const browserGlobals = {
  AbortController: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  localStorage: 'readonly',
  URLSearchParams: 'readonly',
  window: 'readonly',
};

export default [
  { ignores: ['node_modules/**', 'collection-sorter-elastic-beanstalk.zip'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
  },
];
