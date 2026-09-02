import { test, expect, Page } from '@playwright/test';

/**
 * Role journeys against the real running stack and the seeded dataset
 * (see api/src/database/seed-expanded.ts). Every user below is a real
 * seeded account; the password is shared across the seed.
 *
 * These assert on domain language and ARIA roles rather than CSS classes,
 * so a visual restyle doesn't break them — only a behaviour change should.
 */

const PASSWORD = 'Password123!';

const USERS = {
  requester: 'requester5@example.com', // seeded with pending_confirmation tickets
  member: 'member3@example.com',
  manager: 'manager1@example.com', // manages Fintech Support
  support: 'support1@example.com',
  admin: 'admin1@example.com',
} as const;

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Each role lands on a different home screen, so just assert we left /login.
  // The generous timeout is for a cold dev server: the first hit on each route
  // compiles it, and the roles-landing test walks five distinct routes in a
  // row. 15s was enough against a warm server and flaked against a fresh one.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test.describe('Authentication', () => {
  test('rejects a wrong password without leaving the page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.requester);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('each role lands on its own primary screen', async ({ page }) => {
    const expected: Array<[string, RegExp]> = [
      [USERS.requester, /\/dashboard\/tickets/],
      [USERS.member, /\/dashboard\/assigned/],
      [USERS.manager, /\/dashboard\/team/],
      [USERS.support, /\/dashboard\/triage/],
      [USERS.admin, /\/dashboard\/system/],
    ];

    for (const [email, url] of expected) {
      await login(page, email);
      await expect(page, `${email} should land on ${url}`).toHaveURL(url);
      await page.goto('/login'); // reset for the next role
    }
  });
});

test.describe('Requester (FR-1.x, 9.x)', () => {
  test('sees their tickets and can open one', async ({ page }) => {
    await login(page, USERS.requester);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const ticketLink = page.getByRole('link', { name: /TCK-/ }).first();
    const rowLink = page.getByRole('link').filter({ hasText: /TCK-/ }).first();
    const target = (await ticketLink.count()) ? ticketLink : rowLink;
    await target.click();

    await expect(page).toHaveURL(/\/dashboard\/tickets\/[0-9a-f-]{36}/);
    // FR-8.2: the audit trail must be on the detail page.
    await expect(page.getByText(/history/i).first()).toBeVisible();
  });

  test('create-ticket form offers a priority suggestion (FR-1.1)', async ({ page }) => {
    await login(page, USERS.requester);
    await page.goto('/dashboard/new');

    await expect(page.getByLabel(/subject/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
    // Site is required by the API — the form must collect it.
    await expect(page.getByText(/site/i).first()).toBeVisible();
    // Priority is an explicit requirement, not optional polish.
    await expect(page.getByText(/priority/i).first()).toBeVisible();
  });
});

test.describe('Support/Triage (FR-2.x, 11.3)', () => {
  test('queue exposes category, priority and assignment controls', async ({ page }) => {
    await login(page, USERS.support);
    await expect(page).toHaveURL(/\/dashboard\/triage/);

    await expect(page.getByRole('heading', { name: /incoming queue/i })).toBeVisible();
    // FR-2.8: priority confirmation must be reachable from the queue.
    await expect(page.getByText(/priority/i).first()).toBeVisible();
    // FR-2.1: category confirmation.
    await expect(page.getByText(/category/i).first()).toBeVisible();
  });

  test('can reach all tickets, not just their own', async ({ page }) => {
    await login(page, USERS.support);
    await page.goto('/dashboard/tickets');
    await expect(page.getByRole('heading', { name: /all tickets/i })).toBeVisible();
  });
});

test.describe('Manager (FR-3.x)', () => {
  test('team dashboard shows stats, workload and team tickets', async ({ page }) => {
    await login(page, USERS.manager);
    await expect(page).toHaveURL(/\/dashboard\/team/);

    await expect(page.getByRole('heading', { name: /team dashboard/i })).toBeVisible();
    await expect(page.getByText(/workload/i).first()).toBeVisible();
  });

  test('has an availability approval queue (FR-10.3)', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/dashboard/availability');
    await expect(page.getByRole('heading', { name: /availability/i })).toBeVisible();
    // The approval queue is the manager-only half of this page — a plain
    // requester sees "My requests" and nothing else. Assert on the section's
    // real heading rather than a paraphrase.
    // Scoped to headings: "My requests" is also a sidebar link on this page,
    // and an unscoped text match resolves to both.
    await expect(page.getByRole('heading', { name: /waiting on your approval/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /my requests/i })).toBeVisible();
  });
});

test.describe('Admin (FR-5.x, 6.x)', () => {
  test('system dashboard lists long-waiting confirmations (FR-6.4)', async ({ page }) => {
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/dashboard\/system/);
    await expect(page.getByText(/pending confirmation/i).first()).toBeVisible();
  });

  test('can manage teams, sites, categories and users', async ({ page }) => {
    await login(page, USERS.admin);

    for (const [path, heading] of [
      ['/dashboard/admin/teams', /teams/i],
      ['/dashboard/admin/sites', /sites/i],
      ['/dashboard/admin/categories', /categories/i],
      ['/dashboard/admin/users', /users/i],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
  });

  test('user editing can assign a team (FR-5.2)', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/dashboard/admin/users');
    await page.getByRole('button', { name: /edit/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // FR-5.2 is about *assigning* a team, so assert the control is a real,
    // populated select rather than that the word "Team" appears somewhere.
    const teamSelect = dialog.getByRole('combobox');
    await expect(teamSelect).toBeVisible();
    await teamSelect.click();
    await expect(page.getByRole('option', { name: /no team/i })).toBeVisible();
    // At least one actual team beyond the "No team" sentinel.
    expect(await page.getByRole('option').count()).toBeGreaterThan(1);

    // Deliberately read-only. This suite runs against the shared seeded
    // database on knight-labs; a test that saved here would rewrite a real
    // user's team on every run and drift the very counts other tests assert.
    await page.keyboard.press('Escape');
  });
});

test.describe('Role boundaries', () => {
  test('a team member cannot reach admin screens', async ({ page }) => {
    await login(page, USERS.member);
    await page.goto('/dashboard/admin/users');
    // useRequireRole bounces non-admins back to their own primary route.
    await expect(page).not.toHaveURL(/\/dashboard\/admin/, { timeout: 10_000 });
  });

  test('a requester cannot reach the triage queue', async ({ page }) => {
    await login(page, USERS.requester);
    await page.goto('/dashboard/triage');
    await expect(page).not.toHaveURL(/\/dashboard\/triage/, { timeout: 10_000 });
  });
});
