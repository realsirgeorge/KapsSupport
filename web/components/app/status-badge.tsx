import { Badge } from '@/components/ui/badge';
import { isAging, isOpenStatus } from '@/lib/format';

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

const STATUS_VARIANTS: Record<string, 'blue' | 'amber' | 'red' | 'gray'> = {
  new: 'blue',
  assigned: 'blue',
  in_progress: 'amber',
  pending: 'amber',
  resolved: 'blue',
  pending_confirmation: 'blue',
  closed: 'gray',
  reopened: 'red',
};

interface StatusBadgeProps {
  status: string;
  pendingReason?: string | null;
  createdAt?: string | Date;
  agingThresholdDays?: number;
}

/**
 * "Aging" isn't a real ticket status — it's a derived display state for
 * open tickets past the SLA threshold, matching the Figma design system's
 * 4-bucket status scheme (blue/amber/red/gray).
 */
export function StatusBadge({ status, pendingReason, createdAt, agingThresholdDays = 3 }: StatusBadgeProps) {
  const aging = createdAt && isOpenStatus(status) && isAging(createdAt, agingThresholdDays);

  if (aging) {
    return <Badge variant="red">Aging</Badge>;
  }

  const label = STATUS_LABELS[status] ?? status;
  const variant = STATUS_VARIANTS[status] ?? 'gray';
  const text = status === 'pending' && pendingReason ? `Pending — ${pendingReason}` : label;

  return <Badge variant={variant}>{text}</Badge>;
}
