'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TableSkeleton } from './skeleton';
import { EmptyState } from './empty-state';

export interface Column<T> {
  /** Stable key — also used as the React key for the cell. */
  key: string;
  header: React.ReactNode;
  /** Renders the cell. Given the whole row so it can combine fields. */
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Tailwind width utility, e.g. 'w-32'. Omit to size by content. */
  width?: string;
  /** Hide below the lg breakpoint — for columns that aren't load-bearing on narrow screens. */
  hideBelowLg?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Navigates on row click. Rows become keyboard-focusable and Enter-activatable. */
  href?: (row: T) => string;
  isLoading?: boolean;
  /** Shown when rows is empty and not loading. */
  empty?: React.ReactNode;
  /** A left edge accent per row — used to signal priority/urgency at a glance. */
  accent?: (row: T) => string | undefined;
  caption?: string;
  className?: string;
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/**
 * The table used by every list surface in the app (tickets, team tickets,
 * availability, and all four admin screens).
 *
 * Rows are navigable without JavaScript-only click handlers: when `href` is
 * given each row gets role="link", tabIndex, and an Enter/Space handler, so
 * the table is operable by keyboard rather than mouse-only.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  href,
  isLoading,
  empty,
  accent,
  caption,
  className,
}: DataTableProps<T>) {
  const router = useRouter();

  if (isLoading) {
    return <TableSkeleton rows={5} cols={columns.length} />;
  }

  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  }

  const go = (row: T) => {
    if (href) router.push(href(row));
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card shadow-card', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              {accent && <th className="w-1 p-0" aria-hidden="true" />}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'px-6 py-3 font-medium',
                    ALIGN[c.align ?? 'left'],
                    c.width,
                    c.hideBelowLg && 'hidden lg:table-cell',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const interactive = !!href;
              return (
                <tr
                  key={rowKey(row)}
                  {...(interactive
                    ? {
                        role: 'link',
                        tabIndex: 0,
                        onClick: () => go(row),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            go(row);
                          }
                        },
                      }
                    : {})}
                  className={cn(
                    'border-b border-border-subtle transition-colors last:border-0',
                    interactive &&
                      'cursor-pointer hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none',
                  )}
                >
                  {accent && (
                    <td className="p-0" aria-hidden="true">
                      <div className={cn('h-full min-h-[3rem] w-1', accent(row) ?? 'bg-transparent')} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-6 py-3.5 align-middle',
                        ALIGN[c.align ?? 'left'],
                        c.hideBelowLg && 'hidden lg:table-cell',
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Footer strip for a truncated table, matching the reference design's
 * "Showing 5 of 128 tickets — View all →".
 */
export function TableFooter({
  shown,
  total,
  noun = 'items',
  action,
}: {
  shown: number;
  total: number;
  noun?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
      <span>
        Showing <span className="font-semibold text-foreground tabular">{shown}</span> of{' '}
        <span className="font-semibold text-foreground tabular">{total}</span> {noun}
      </span>
      {action}
    </div>
  );
}
