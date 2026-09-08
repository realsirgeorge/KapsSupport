import { cn } from '@/lib/utils';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

const LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const TONES: Record<Priority, string> = {
  low: 'text-priority-low',
  medium: 'text-priority-medium',
  high: 'text-priority-high',
  urgent: 'text-priority-urgent',
};

/** Left-edge row accent, for DataTable's `accent` prop. */
export const PRIORITY_ACCENT: Record<Priority, string> = {
  low: 'bg-priority-low/40',
  medium: 'bg-priority-medium/60',
  high: 'bg-priority-high/70',
  urgent: 'bg-priority-urgent',
};

export function isPriority(v: unknown): v is Priority {
  return typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v);
}

/**
 * Priority as coloured text plus a dot (FR-1.1/2.8). Priority is a label
 * only in v1 — no SLA timers hang off it (REQUIREMENTS §5) — so this is
 * deliberately quieter than StatusBadge, which carries workflow state.
 *
 * The label is always rendered, never colour alone.
 */
export function PriorityBadge({
  priority,
  suggested,
  className,
}: {
  priority?: string | null;
  /** Renders as "High (suggested)" for a requester's un-confirmed guess. */
  suggested?: boolean;
  className?: string;
}) {
  if (!isPriority(priority)) {
    return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', TONES[priority], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[priority]}
      {suggested && <span className="text-xs font-normal text-muted-foreground">(suggested)</span>}
    </span>
  );
}

export function priorityLabel(p?: string | null): string {
  return isPriority(p) ? LABELS[p] : '—';
}
