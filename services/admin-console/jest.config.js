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
    // second, narrower piece of the same sandbox-only workaround — see
    // BUILD_LOG/admin-console.md. Full type-checking still happens via
    // `npm run typecheck` (tsc), which is expected to fail in this sandbox
    // for the same root cause and pass once `prisma generate` runs
    // somewhere with network access.
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
