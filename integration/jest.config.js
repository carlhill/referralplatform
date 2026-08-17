/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.int-spec.ts'],
  // These talk to real containers: Keycloak token calls, immudb writes and a relay
  // poll interval are all slower than a unit test, and running in band keeps the
  // audit assertions deterministic.
  testTimeout: 60_000,
};
