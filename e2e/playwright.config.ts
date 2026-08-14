import { defineConfig, devices } from '@playwright/test';

/**
 * Golden-path e2e config for the ReferralPlatform docker-compose stack.
 *
 * Ports below match the root docker-compose.yml's port map exactly (see
 * that file's header comment) — this suite is designed to run against
 * `docker compose up` on a normal machine (i.e. one whose network policy
 * allows pulling Docker Hub / quay.io images and reaching
 * binaries.prisma.sh — see e2e/README.md, "Known limitations" for why
 * that could NOT be verified in the sandbox this suite was written in).
 *
 * No `webServer` block: this suite intentionally does not attempt to start
 * the stack itself (`docker compose up` is a multi-minute, multi-container
 * operation orchestrated by CI/local scripts, not something to nest inside
 * a test runner's lifecycle) — run `docker compose up -d --build` from the
 * repo root first, then `npm test` here.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // the golden path is a single ordered narrative across three apps/personas
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
