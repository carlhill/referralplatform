/**
 * TEST-ONLY STUB for `@prisma/client`, wired in only via this service's
 * `jest.config.js` `moduleNameMapper` (unit tests, `src/**\/*.spec.ts`).
 *
 * Why this exists: `@prisma/client`'s real generated code comes from
 * `prisma generate`, which downloads a schema-engine binary from
 * binaries.prisma.sh. In this build's sandbox that host is blocked by
 * outbound egress policy (confirmed via the agent proxy status endpoint as a
 * policy denial, not a transient failure) — see BUILD_LOG/notification.md
 * and BUILD_LOG/referral.md/BUILD_LOG/onboarding-account.md for the same,
 * already-documented workaround. Without a generated client,
 * `import { PrismaClient } from '@prisma/client'` throws at module load
 * time, which would make every test that transitively imports
 * PrismaService impossible to run in this sandbox, even ones that never
 * touch Postgres.
 *
 * NOT used outside `jest.config.js`: the Dockerfile, `npm run build`, and
 * `npm run start` all resolve the real `@prisma/client` package as normal.
 * Every unit test that exercises real business logic constructs the
 * service under test with a small hand-rolled fake Prisma object shaped
 * like the calls it actually makes (see src/notifications/notification.service.spec.ts
 * and src/message-threads/message-thread.service.spec.ts) — this stub's
 * `$connect`/`$disconnect` are never expected to do anything real.
 * Delete the `moduleNameMapper` entry in jest.config.js once
 * `npm run prisma:generate -w services/notification` can run for real.
 */
export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}
