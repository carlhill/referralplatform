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

      // Casting to AuditEventType hides producer/consumer drift until it becomes
      // silent data loss. Three services used to declare a local event-type union and
      // cast at the call site, on the stated assumption that "the Audit Log Service
      // accepts type as an opaque string over the wire". It does not — it validates
      // against a runtime whitelist derived from the shared union — so every one of
      // those events was rejected with 400, and the ones written without an outbox
      // were discarded outright. Passkey revocations went unrecorded for months.
      //
      // Add new event types to packages/shared-types/src/audit-event.ts AND
      // services/audit-log/src/audit-events/dto/create-audit-event.dto.ts (a
      // compile-time assertion and a contract test keep the two in step), then emit
      // the literal directly. Do not reach for a cast.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSTypeReference > Identifier[name="AuditEventType"]',
          message:
            'Do not cast to AuditEventType. Add the event type to shared-types AND ' +
            "audit-log's AUDIT_EVENT_TYPES whitelist, then use the literal directly — " +
            'a cast only silences the compiler while the Audit Log Service still rejects ' +
            'the event with 400.',
        },
      ],
    },
  },
  {
    // The relay deserialises rows out of Postgres, where `type` is genuinely a
    // `string` — this is the one legitimate boundary cast, and it is guarded by the
    // whitelist on the receiving end.
    files: ['packages/audit-outbox/src/relay.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
