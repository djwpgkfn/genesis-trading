// ESLint v9 flat config
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.integration.ts', 'apps/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // Determinism guardrails (Constitution P2)
      'no-restricted-properties': [
        'warn',
        { object: 'Math', property: 'random', message: 'Nondeterministic. Use a pinned rng_seed (Snapshot).' },
        { object: 'Date', property: 'now', message: 'Use injected clock; capture event_time/ingest_time explicitly.' },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
