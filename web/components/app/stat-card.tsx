import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  primary?: boolean;
  icon?: LucideIcon;
  hint?: string;
  hintTone?: 'default' | 'amber';
  className?: string;
}

export function StatCard({ label, value, primary, icon: Icon, hint, hintTone = 'default', className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-5',
        primary
          ? 'border-transparent bg-primary text-primary-foreground shadow-glow'
          : 'border-border bg-card text-card-foreground shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn('text-xs font-semibold uppercase tracking-wider', primary ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
          {label}
        </p>
        {Icon && <Icon className={cn('h-4 w-4', primary ? 'text-primary-foreground/70' : 'text-muted-foreground')} />}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
      {hint && (
        <p
          className={cn(
            'mt-1 text-xs',
            primary
              ? 'text-primary-foreground/70'
              : hintTone === 'amber'
                ? 'text-status-amber'
                : 'text-muted-foreground',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
