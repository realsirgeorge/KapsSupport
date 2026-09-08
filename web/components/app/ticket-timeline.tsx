import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { relativeTime } from '@/lib/format';
import { priorityLabel } from './priority-badge';
import { History } from 'lucide-react';

export interface HistoryEntry {
  id: string;
  action: string;
  field_changed?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
  actor_name?: string | null;
  old_value_name?: string | null;
  new_value_name?: string | null;
  old_category_name?: string | null;
  new_category_name?: string | null;
  old_site_name?: string | null;
  new_site_name?: string | null;
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

const statusLabel = (v?: string | null) => (v ? (STATUS_LABELS[v] ?? v) : null);

/** Turns one audit row into a sentence, preferring resolved names over raw UUIDs. */
function describe(e: HistoryEntry): string {
  switch (e.action) {
    case 'created':
      return 'submitted this ticket';
    case 'status_changed': {
      const from = statusLabel(e.old_value);
      const to = statusLabel(e.new_value);
      return from ? `changed status from ${from} to ${to}` : `set status to ${to}`;
    }
    case 'assigned':
      return `assigned this to ${e.new_value_name ?? 'a team member'}`;
    case 'reassigned':
      return `reassigned this from ${e.old_value_name ?? 'someone'} to ${e.new_value_name ?? 'someone else'}`;
    case 'category_changed':
      return e.old_category_name
        ? `changed the category from ${e.old_category_name} to ${e.new_category_name ?? 'none'}`
        : `confirmed the category as ${e.new_category_name ?? 'none'}`;
    case 'priority_changed': {
      const to = priorityLabel(e.new_value);
      return e.old_value
        ? `changed the priority from ${priorityLabel(e.old_value)} to ${to}`
        : `confirmed the priority as ${to}`;
    }
    case 'site_corrected':
      return `corrected the site from ${e.old_site_name ?? 'unknown'} to ${e.new_site_name ?? 'unknown'}`;
    default:
      return e.field_changed ? `updated ${e.field_changed.replace(/_/g, ' ')}` : 'updated this ticket';
  }
}

/**
 * The per-ticket audit trail required by FR-8.2 — every status change,
 * assignment, and reassignment with actor and timestamp.
 *
 * actor_name is null for rows written before the app.current_user_id fix
 * landed; those render as "System" rather than pretending to know who acted.
 */
export function TicketTimeline({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState size="compact" icon={History} title="No history yet" />;
  }

  return (
    <ol className="relative space-y-4 pl-2">
      {entries.map((e, i) => {
        const actor = e.actor_name ?? 'System';
        const isLast = i === entries.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3">
            {!isLast && (
              <span
                className="absolute left-[13px] top-8 bottom-[-1rem] w-px bg-border"
                aria-hidden="true"
              />
            )}
            <Avatar name={actor} size="sm" className="z-10" />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm text-foreground">
                <span className="font-medium">{actor}</span> {describe(e)}
              </p>
              <time className="text-xs text-muted-foreground" dateTime={e.created_at}>
                {relativeTime(e.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
