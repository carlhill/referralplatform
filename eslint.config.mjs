// Root ESLint flat config (ESLint 9+/10 style) — shared across every service, app,
// and package. See CONVENTIONS.md ("Linting"). Individual workspaces run
// `eslint <their src dir>`; there is deliberately no per-service eslint config —
// one shared ruleset is what keeps ~15 parallel agents' code consistent.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.mjs',
      'services/fhir-gateway/**',
      'infra/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The domain is genuinely early-stage and interop-heavy (Keycloak claims,
      // Prisma JSON columns, FHIR payloads) — `any` is allowed but discouraged,
      // not banned outright, at this stage of the build.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
