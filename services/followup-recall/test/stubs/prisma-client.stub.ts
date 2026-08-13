/**
 * TEST-ONLY STUB for `@prisma/client`, wired in only via this service's
 * `jest.config.js` `moduleNameMapper` (unit tests, `src/**\/*.spec.ts`).
 *
 * Why this exists: `@prisma/client`'s real generated code comes from
 * `prisma generate`, which downloads a schema-engine binary from
 * binaries.prisma.sh. In this build's sandbox that host is blocked by
 * outbound egress policy (confirmed via the agent proxy status endpoint as
 * a policy denial: "Failed to fetch sha256 checksum ... 403 Forbidden", not
 * a transient failure). Without a generated client,
 * `import { PrismaClient } from '@prisma/client'` throws at module load
 * time, which would make every test that transitively imports
 * PrismaService impossible to run in this sandbox, even ones that never
 * touch Postgres. See BUILD_LOG/referral.md, BUILD_LOG/consent-security.md,
 * and BUILD_LOG/followup-recall.md for the full story (an identical,
 * already-documented workaround used across this monorepo).
 *
 * NOT used outside `jest.config.js`: the Dockerfile, `npm run build`, and
 * `npm run start` all resolve the real `@prisma/client` package as normal.
 * Every unit test that exercises real business logic constructs the
 * service under test with a small hand-rolled fake Prisma object shaped
 * like the calls it actually makes (see e.g.
 * src/follow-up-plans/follow-up-plans.service.spec.ts) — this stub's
 * `$connect`/`$disconnect` are never expected to do anything real.
 * Delete the `moduleNameMapper` entry in jest.config.js once
 * `npm run prisma:generate -w services/followup-recall` can run for real.
 */
export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}
