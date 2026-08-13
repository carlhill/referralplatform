/**
 * TEST-ONLY STUB for `@prisma/client` — see the identical, more fully
 * documented version of this file in
 * services/gp-authorisation/test/stubs/prisma-client.stub.ts and
 * services/audit-log/test/stubs/prisma-client.stub.ts for the full
 * explanation (binaries.prisma.sh blocked by this sandbox's egress policy).
 * Only wired in via jest.config.js's moduleNameMapper for unit tests; the
 * Dockerfile/build/start paths all resolve the real @prisma/client.
 */
export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}
