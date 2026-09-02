import { cn } from '@/lib/utils';

interface SectionProps {
  /** Small uppercase eyebrow above the panel. */
  title?: string;
  /**
   * One line under the eyebrow saying what the region means or what it does
   * not do — e.g. "Visibility only, nothing here closes on its own". Lives
   * here rather than as a stray <p> in each page so the type and spacing
   * stay identical across surfaces.
   */
  subtitle?: string;
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
export function Section({
  title,
  subtitle,
  action,
  bare,
  className,
  bodyClassName,
  children,
}: SectionProps) {
  return (
    <section className={className}>
      {(title || action) && (
        <div
          className={cn(
            'flex min-h-[1.5rem] items-center justify-between gap-4',
            subtitle ? 'mb-1' : 'mb-3',
          )}
        >
          {title && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
          )}
          {action}
        </div>
      )}
      {subtitle && <p className="mb-3 text-sm text-muted-foreground">{subtitle}</p>}
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
