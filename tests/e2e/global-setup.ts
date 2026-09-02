import type { FullConfig } from '@playwright/test';

/**
 * Compile every route before the first test touches it.
 *
 * `next dev` compiles a route on its first request, and a cold compile of one
 * of the heavier dashboard pages takes far longer than any reasonable
 * per-assertion timeout. Without this the suite failed its first four tests on
 * a freshly-started server and passed every run afterwards — the classic shape
 * of a flake that looks like a product bug and isn't. Raising timeouts only
 * moves the guess around; compiling up front removes the variable.
 *
 * A plain unauthenticated GET is enough: the route still has to be built
 * before it can redirect. Sequential rather than parallel, because the point
 * is to let the compiler finish, not to race it.
 */
const ROUTES = [
  '/login',
  '/dashboard',
  '/dashboard/tickets',
  '/dashboard/new',
  '/dashboard/assigned',
  '/dashboard/team',
  '/dashboard/triage',
  '/dashboard/system',
  '/dashboard/availability',
  '/dashboard/admin/users',
  '/dashboard/admin/teams',
  '/dashboard/admin/sites',
  '/dashboard/admin/categories',
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const started = Date.now();

  for (const route of ROUTES) {
    try {
      await fetch(`${baseURL}${route}`, { redirect: 'manual' });
    } catch (err) {
      // A route that won't even respond is the tests' problem to report, with
      // the assertion that names what it expected. Don't fail setup over it.
      console.warn(`warm-up: ${route} did not respond (${(err as Error).message})`);
    }
  }

  console.log(`warm-up: compiled ${ROUTES.length} routes in ${Math.round((Date.now() - started) / 1000)}s`);
}
