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
