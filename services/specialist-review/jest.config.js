/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
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
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
