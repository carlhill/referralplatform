/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  // See test/stubs/prisma-client.stub.ts for why this mapping exists (sandbox-only
  // workaround for `prisma generate` being unreachable — safe to delete once it isn't).
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/../test/stubs/prisma-client.stub.ts',
  },
  transform: {
    // isolatedModules (transpile-only, no cross-file type-check) is a
    // second, narrower piece of the same sandbox-only workaround: without a
    // generated Prisma client, `PrismaService.prisma.auditEventIndex` has no
    // type (see prisma/schema.prisma's model — it's real, just not codegen'd
    // here). Full type-checking still happens via `npm run typecheck`
    // (tsc), which is expected to fail in this sandbox for the same root
    // cause and pass once `prisma generate` runs somewhere with network
    // access — see BUILD_LOG/audit-log.md. Safe to remove once it does.
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
