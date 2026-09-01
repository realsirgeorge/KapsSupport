import type { Counters } from './counters-context';

export interface NavItem {
  label: string;
  href: string;
  badgeKey?: keyof Counters | 'triage_queue';
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  team_id?: string | null;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive: boolean;
  is_unavailable: boolean;
  manages_team_id?: string | null;
}

export function roleLabel(user: CurrentUser): string {
  if (user.is_admin) return user.is_executive ? 'Admin · Executive' : 'Admin';
  if (user.is_executive) return 'Executive · Read-only';
  if (user.manages_team_id) return 'Manager';
  if (user.is_support_triage) return 'Support / Triage';
  if (user.team_id) return 'Team member';
  return 'Requester';
}

export function primaryRoute(user: CurrentUser): string {
  if (user.is_admin || user.is_executive) return '/dashboard/system';
  if (user.manages_team_id) return '/dashboard/team';
  if (user.is_support_triage) return '/dashboard/triage';
  if (user.team_id) return '/dashboard/assigned';
  return '/dashboard/tickets';
}

export function navSections(user: CurrentUser): NavSection[] {
  const sections: NavSection[] = [];

  if (user.is_admin || user.is_executive) {
    sections.push({
      items: [{ label: 'System dashboard', href: '/dashboard/system', badgeKey: 'total_open' }],
    });
    // Admin CRUD is write access — Executive is read-only system-wide, so
    // these links are Admin-only, not shown to Executives.
    if (user.is_admin) {
      sections.push({
        heading: 'Admin',
        items: [
          { label: 'Teams', href: '/dashboard/admin/teams' },
          { label: 'Sites', href: '/dashboard/admin/sites' },
          { label: 'Categories', href: '/dashboard/admin/categories' },
          { label: 'Users & roles', href: '/dashboard/admin/users' },
        ],
      });
    }
    return sections;
  }

  if (user.manages_team_id) {
    sections.push({
      items: [{ label: 'Team dashboard', href: '/dashboard/team', badgeKey: 'team_open' }],
    });
    sections.push({
      heading: 'Personal',
      items: [
        { label: 'My requests', href: '/dashboard/tickets' },
        { label: 'Availability', href: '/dashboard/availability' },
      ],
    });
    return sections;
  }

  if (user.is_support_triage) {
    sections.push({
      items: [
        { label: 'Incoming queue', href: '/dashboard/triage', badgeKey: 'triage_queue' },
        { label: 'All tickets', href: '/dashboard/tickets' },
      ],
    });
    return sections;
  }

  if (user.team_id) {
    sections.push({
      items: [{ label: 'Assigned to me', href: '/dashboard/assigned', badgeKey: 'assigned_open' }],
    });
    sections.push({
      heading: 'Personal',
      items: [
        { label: 'My requests', href: '/dashboard/tickets' },
        { label: 'Availability', href: '/dashboard/availability' },
      ],
    });
    return sections;
  }

  sections.push({
    items: [
      { label: 'My tickets', href: '/dashboard/tickets', badgeKey: 'open' },
      { label: 'New ticket', href: '/dashboard/new' },
    ],
  });
  return sections;
}

export function navBadgeValue(item: NavItem, counters: Counters | null): number | null {
  if (!counters || !item.badgeKey) return null;
  if (item.badgeKey === 'triage_queue') {
    const awaiting = (counters.awaiting_category ?? 0) + (counters.awaiting_assignment ?? 0);
    return awaiting > 0 ? awaiting : null;
  }
  const value = counters[item.badgeKey];
  return typeof value === 'number' && value > 0 ? value : null;
}

/**
 * Single "needs your attention" number for the notification bell, per role.
 * Deliberately conservative: only surfaces a number when one is directly
 * available from /me/counters without extra fetches, rather than guessing
 * at relevance with data this component doesn't have.
 */
export function needsAttentionCount(user: CurrentUser, counters: Counters | null): number | null {
  if (!counters) return null;
  if (user.is_admin || user.is_executive) return counters.aging_over_3_days ?? null;
  if (user.manages_team_id) return null;
  if (user.is_support_triage) {
    const awaiting = (counters.awaiting_category ?? 0) + (counters.awaiting_assignment ?? 0);
    return awaiting > 0 ? awaiting : null;
  }
  if (user.team_id) return counters.pending_blocked ?? null;
  return counters.pending_confirmation ?? null;
}
