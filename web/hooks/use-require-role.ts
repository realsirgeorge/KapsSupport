'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/app/user-context';
import { primaryRoute } from '@/components/app/nav-config';

/**
 * Redirects away from a role-gated page if the current user doesn't satisfy
 * `predicate`. Read-only list endpoints (teams/sites/categories) are open to
 * every authenticated user, so without this guard a non-admin who navigates
 * directly to an admin URL would see write controls that 403 on click
 * instead of being sent somewhere that makes sense for their role.
 */
export function useRequireRole(predicate: boolean): boolean {
  const user = useUser();
  const router = useRouter();
  const allowed = predicate;

  useEffect(() => {
    if (!allowed) router.replace(primaryRoute(user));
  }, [allowed, user, router]);

  return allowed;
}
