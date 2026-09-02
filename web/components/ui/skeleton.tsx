import { cn } from '@/lib/utils';

/**
 * Loading placeholder. Sized by the caller so it occupies the same space the
 * real content will, which stops the layout jumping when data lands.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted animate-shimmer', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Placeholder matching the stat-card row that heads most pages. */
export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={cn('grid gap-4', count === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[104px]" />
      ))}
    </div>
  );
}

/** Placeholder matching a DataTable of the given shape. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex gap-6 border-b border-border px-6 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-6 border-b border-border px-6 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" style={{ opacity: 1 - r * 0.13 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Whole-page loading state: header block, stats row, then a table.
 * Replaces the bare "Loading..." text every page used to render.
 */
export function PageSkeleton({ stats = 3, rows = 5, cols = 4 }: { stats?: number; rows?: number; cols?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-3 w-80" />
      </div>
      {stats > 0 && <StatCardsSkeleton count={stats} />}
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  );
}
