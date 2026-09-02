import { defineConfig, devices } from '@playwright/test';

/**
 * Targets the already-running dev servers (web on :3000, API on :3001)
 * against the remote database on knight-labs.
 *
 * There is deliberately no `webServer` block. It previously ran
 * `docker compose up`, which stands the whole stack up locally including
 * Postgres and Redis — this machine is memory-constrained and its database
 * lives on a separate host, so that would both fail and fight the real
 * environment. Start the servers yourself before running these:
 *
 *   cd api && node dist/main.js &
 *   cd web && npm run dev &
 *
 * Do not run `npm run build` in web/ while that dev server is up: both write
 * the same `.next` directory, and the build replaces the chunks the running
 * server is serving. The pages still render server-side but never hydrate, so
 * every control goes dead and the failure looks like a React bug rather than a
 * clobbered cache. Stop the dev server first, or build with a separate
 * distDir.
 *
 * These tests are read-only by construction — they open dialogs and assert on
 * controls but never save, submit, or create. That is deliberate: they run
 * against the shared seeded database on knight-labs, so a test that wrote
 * would drift the fixtures other tests assert on, a little more on every run.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // these tests share one database; serial keeps state legible
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
