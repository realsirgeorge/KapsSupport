export interface NavItem {
  label: string;
  href: string;
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
      items: [{ label: 'System dashboard', href: '/dashboard/system' }],
    });
    // Admin CRUD screens (Teams/Sites/Categories/Users) aren't built yet —
    // omitted rather than linking to pages that don't exist.
    return sections;
  }

  if (user.manages_team_id) {
    sections.push({
      items: [{ label: 'Team dashboard', href: '/dashboard/team' }],
    });
    sections.push({
      heading: 'Personal',
      items: [{ label: 'My requests', href: '/dashboard/tickets' }],
    });
    return sections;
  }

  if (user.is_support_triage) {
    sections.push({
      items: [
        { label: 'Incoming queue', href: '/dashboard/triage' },
        { label: 'All tickets', href: '/dashboard/tickets' },
      ],
    });
    return sections;
  }

  if (user.team_id) {
    sections.push({
      items: [{ label: 'Assigned to me', href: '/dashboard/assigned' }],
    });
    sections.push({
      heading: 'Personal',
      items: [{ label: 'My requests', href: '/dashboard/tickets' }],
    });
    return sections;
  }

  sections.push({
    items: [
      { label: 'My tickets', href: '/dashboard/tickets' },
      { label: 'New ticket', href: '/dashboard/new' },
    ],
  });
  return sections;
}
