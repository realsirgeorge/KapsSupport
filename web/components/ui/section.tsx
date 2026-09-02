import { cn } from '@/lib/utils';

interface SectionProps {
  /** Small uppercase eyebrow above the panel. */
  title?: string;
  /** Right-aligned controls on the title row (filters, "view all", counts). */
  action?: React.ReactNode;
  /** Wrap children in a bordered card. Off when the child is its own card (e.g. DataTable). */
  bare?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Titled region — the eyebrow-label + panel pattern that repeats across
 * every dashboard surface. Kept as one component so the label casing,
 * spacing, and panel treatment can't drift between pages.
 */
export function Section({ title, action, bare, className, bodyClassName, children }: SectionProps) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-3 flex min-h-[1.5rem] items-center justify-between gap-4">
          {title && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
          )}
          {action}
        </div>
      )}
      {bare ? (
        <div className={bodyClassName}>{children}</div>
      ) : (
        <div className={cn('rounded-lg border border-border bg-card p-5 shadow-card', bodyClassName)}>
          {children}
        </div>
      )}
    </section>
  );
}
