export interface ActivityEntry {
  id: string;
  action: string;
  field_changed?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
  ticket_number: string;
  ticket_id: string;
  actor_name?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  pending: 'Pending',
  resolved: 'Resolved',
  pending_confirmation: 'Pending confirmation',
  closed: 'Closed',
  reopened: 'Reopened',
};

/** Splits into text-before-the-ticket-link, the ticket number itself, and text-after, so the UI can render only the ticket number as a link. */
export function describeActivity(entry: ActivityEntry): { actor: string; before: string; after: string } {
  // A null actor means the audit trigger fired with no app.current_user_id
  // set — a write outside withActor, e.g. a one-off manual data repair, not
  // a real user action. TicketTimeline uses the same fallback for the same
  // condition; keep the two in step rather than one saying "System" and the
  // other "Someone" for an identical row.
  const actor = entry.actor_name || 'System';

  switch (entry.action) {
    case 'created':
      return { actor, before: 'submitted', after: '' };
    case 'assigned':
      return { actor, before: 'assigned', after: '' };
    case 'reassigned':
      return { actor, before: 'reassigned', after: '' };
    case 'category_changed':
      return { actor, before: 'confirmed the category on', after: '' };
    case 'site_corrected':
      return { actor, before: 'corrected the site on', after: '' };
    case 'status_changed': {
      const label = entry.new_value ? STATUS_LABELS[entry.new_value] ?? entry.new_value : 'a new status';
      return { actor, before: 'moved', after: `to ${label}` };
    }
    default:
      return { actor, before: 'updated', after: '' };
  }
}
