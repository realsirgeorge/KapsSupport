import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** One line on what to do next. An empty screen is an invitation to act. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Compact fits inside a panel; default fills a page region. */
  size?: 'default' | 'compact';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 text-center',
        size === 'compact' ? 'px-6 py-8' : 'px-6 py-16',
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
