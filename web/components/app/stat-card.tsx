import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  primary?: boolean;
  className?: string;
}

export function StatCard({ label, value, primary, className }: StatCardProps) {
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
      <p className={cn('text-sm', primary ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
