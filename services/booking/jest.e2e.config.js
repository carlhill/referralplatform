/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'test',
  testRegex: '.*\\.e2e-spec\\.ts$',
  // Same sandbox-only workaround as jest.config.js (see stubs/prisma-client.stub.ts) —
  // without it, ts-jest type-checks the full AppModule import graph (which now
  // includes real Prisma-model-typed services, not just HealthModule) against the
  // un-generated @prisma/client package and fails to compile. This is a pre-existing
  // gap already present in services/referral/jest.e2e.config.js for the identical
  // reason — not something introduced here, just also fixed here so this service's
  // own e2e suite can actually run in this sandbox.
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/stubs/prisma-client.stub.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
