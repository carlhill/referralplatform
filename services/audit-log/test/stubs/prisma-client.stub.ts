/**
 * TEST-ONLY STUB for `@prisma/client`, wired in only via this service's
 * `jest.config.js` `moduleNameMapper` (unit tests, `src/**\/*.spec.ts`).
 *
 * Why this exists: `@prisma/client`'s real generated code comes from
 * `prisma generate`, which downloads a schema-engine binary from
 * binaries.prisma.sh. In this build's sandbox that host is blocked by
 * outbound egress policy (confirmed via the agent proxy status endpoint as a
 * policy denial — 403 on CONNECT — not a transient failure or a
 * misconfiguration, so not something to route around). Without a generated
 * client, `import { PrismaClient } from '@prisma/client'` throws
 * `Cannot find module '.prisma/client/default'` at *module load* time —
 * which would otherwise make every test that transitively imports
 * PrismaService (i.e. most of this service's business logic) impossible to
 * run at all in this environment, even the ones that never touch Postgres.
 *
 * This stub exists purely so `class PrismaService extends PrismaClient`
 * (services/audit-log/src/prisma/prisma.service.ts) doesn't crash the module
 * graph. Every unit test in this service that exercises AuditEventsService's
 * logic constructs it directly with a small hand-rolled fake object shaped
 * like the two Prisma calls it actually makes (see
 * src/audit-events/audit-events.service.spec.ts) — this stub's `$connect`/
 * `$disconnect` are never expected to do anything real, and none of
 * `PrismaClient`'s query methods are exercised through it.
 *
 * NOT used outside `jest.config.js`: the Dockerfile, `npm run build`, and
 * `npm run start` all resolve the real `@prisma/client` package as normal —
 * this stub only intercepts Jest's module resolution for unit test runs in
 * this sandbox. Once `prisma generate` can reach binaries.prisma.sh (any
 * real dev machine or CI runner with normal egress), delete the
 * `moduleNameMapper` entry in `jest.config.js` — the real client will load
 * beneath the manually-created `AuditEventIndex` model, exactly as any
 * other Prisma-backed service in this repo behaves once generated.
 */
export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}
