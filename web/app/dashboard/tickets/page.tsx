'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Inbox, Clock3, CheckCircle2, TicketX, SearchX } from 'lucide-react';
import { ticketApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { PriorityBadge, PRIORITY_ACCENT, isPriority } from '@/components/app/priority-badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { relativeTime, isOpenStatus } from '@/lib/format';

/**
 * One page fetch backs both the table and every count on it. The tab counts
 * and the stat cards are derived client-side from this same array, so if a
 * user ever holds more than FETCH_LIMIT tickets the totals silently
 * under-report the tail. Paginating the list means moving the counts to a
 * server-side aggregate at the same time — they are one change, not two.
 */
const FETCH_LIMIT = 100;

type TabKey = 'all' | 'open' | 'pending_confirmation' | 'closed';

const TABS: { key: TabKey; label: string; match: (t: Ticket) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'open', label: 'Open', match: (t) => isOpenStatus(t.status) },
  {
    key: 'pending_confirmation',
    label: 'Pending confirmation',
    match: (t) => t.status === 'pending_confirmation',
  },
  { key: 'closed', label: 'Closed', match: (t) => t.status === 'closed' },
];

/** Confirmed priority is the real one; a requester's suggestion stands in until triage confirms it. */
function priorityOf(t: Ticket) {
  return t.confirmed_priority ?? t.suggested_priority;
}

export default function TicketsPage() {
  const user = useUser();
  const { query } = useSearch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('all');

  // Support/Triage and Admin see every ticket here ("All tickets"); everyone
  // else sees only tickets they personally submitted ("My tickets"/"My requests").
  const showAllTickets = user.is_admin || user.is_support_triage;

  useEffect(() => {
    let cancelled = false;
    ticketApi
      .list(showAllTickets ? { limit: FETCH_LIMIT } : { mine: true, limit: FETCH_LIMIT })
      .then((res) => {
        if (!cancelled) setTickets(res.data.data || []);
      })
      .catch(() => {
        if (!cancelled) setError('We could not load your tickets. Refresh the page to try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAllTickets]);

  const searched = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter(
      (t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
    );
  }, [tickets, query]);

  // Counts sit on the searched set, so a tab never advertises rows the
  // active search has already filtered out.
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: 0, open: 0, pending_confirmation: 0, closed: 0 };
    for (const t of searched) {
      for (const def of TABS) if (def.match(t)) counts[def.key]++;
    }
    return counts;
  }, [searched]);

  // Computed client-side from the fetched list, rather than /me/counters —
  // that endpoint's shape is keyed by the user's primary role/queue, not by
  // "counters for the ticket set this particular page is showing". See the
  // FETCH_LIMIT note above for the drift this trades away.
  const counters = useMemo(() => {
    const now = new Date();
    let open = 0;
    let pendingConfirmation = 0;
    let closedThisMonth = 0;
    for (const t of tickets) {
      if (isOpenStatus(t.status)) open++;
      if (t.status === 'pending_confirmation') pendingConfirmation++;
      if (t.status === 'closed' && t.closed_at) {
        const closedAt = new Date(t.closed_at);
        if (closedAt.getFullYear() === now.getFullYear() && closedAt.getMonth() === now.getMonth()) {
          closedThisMonth++;
        }
      }
    }
    return { open, pendingConfirmation, closedThisMonth };
  }, [tickets]);

  const columns = useMemo<Column<Ticket>[]>(() => {
    const cols: Column<Ticket>[] = [
      {
        key: 'ticket_number',
        header: 'Ticket',
        width: 'w-32',
        // The whole row is the link (DataTable `href`), so this stays plain
        // text — a nested anchor would double-navigate.
        cell: (t) => <span className="font-mono text-sm font-medium text-primary">{t.ticket_number}</span>,
      },
      {
        key: 'subject',
        header: 'Subject',
        cell: (t) => <span className="font-medium text-foreground">{t.subject}</span>,
      },
      {
        key: 'category',
        header: 'Category',
        hideBelowLg: true,
        cell: (t) => (
          <span className="text-muted-foreground">{t.category_name ?? 'Not yet categorised'}</span>
        ),
      },
    ];

    if (showAllTickets) {
      cols.push({
        key: 'requester',
        header: 'Requester',
        hideBelowLg: true,
        cell: (t) => <span className="text-muted-foreground">{t.requester_name ?? '—'}</span>,
      });
    }

    cols.push(
      {
        key: 'priority',
        header: 'Priority',
        width: 'w-32',
        cell: (t) =>
          t.confirmed_priority ? (
            <PriorityBadge priority={t.confirmed_priority} />
          ) : (
            <PriorityBadge priority={t.suggested_priority} suggested />
          ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (t) => (
          <StatusBadge status={t.status} pendingReason={t.pending_reason} createdAt={t.created_at} />
        ),
      },
      {
        key: 'updated',
        header: 'Updated',
        align: 'right',
        width: 'w-28',
        cell: (t) => <span className="tabular text-muted-foreground">{relativeTime(t.updated_at)}</span>,
      },
    );

    return cols;
  }, [showAllTickets]);

  const title = showAllTickets ? 'All tickets' : user.team_id || user.manages_team_id ? 'My requests' : 'My tickets';
  const subtitle = showAllTickets
    ? 'Every ticket in the system'
    : "Track requests you've submitted and their status";

  const newTicketButton = (
    <Button asChild>
      <Link href="/dashboard/new">New ticket</Link>
    </Button>
  );

  if (isLoading) {
    return <PageSkeleton stats={3} rows={6} cols={showAllTickets ? 6 : 5} />;
  }

  if (error) {
    return <div className="text-destructive">{error}</div>;
  }

  const emptyFor = (key: TabKey) => {
    if (tickets.length === 0) {
      return showAllTickets ? (
        <EmptyState
          icon={TicketX}
          title="No tickets yet"
          description="Nothing has been raised in the system so far."
        />
      ) : (
        <EmptyState
          icon={TicketX}
          title="You haven't raised any tickets"
          description="Report a problem and it will be routed to the right team for you."
          action={newTicketButton}
        />
      );
    }
    if (query.trim()) {
      return (
        <EmptyState
          icon={SearchX}
          title="No tickets match your search"
          description={`Nothing here matches "${query.trim()}". Try a ticket number or a word from the subject.`}
        />
      );
    }
    const label = TABS.find((t) => t.key === key)?.label ?? '';
    return (
      <EmptyState
        icon={Inbox}
        title={`Nothing ${label.toLowerCase()}`}
        description="Tickets appear here as they reach this stage."
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title={title}
        subtitle={subtitle}
        action={!showAllTickets ? newTicketButton : undefined}
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Open tickets" value={counters.open} icon={Inbox} primary />
        <StatCard label="Pending confirmation" value={counters.pendingConfirmation} icon={Clock3} />
        <StatCard label="Closed this month" value={counters.closedThisMonth} icon={CheckCircle2} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          {TABS.map((def) => (
            <TabsTrigger key={def.key} value={def.key} count={tabCounts[def.key]}>
              {def.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((def) => (
          <TabsContent key={def.key} value={def.key}>
            <DataTable
              columns={columns}
              rows={searched.filter(def.match)}
              rowKey={(t) => t.id}
              href={(t) => `/dashboard/tickets/${t.id}`}
              accent={(t) => {
                const p = priorityOf(t);
                return isPriority(p) ? PRIORITY_ACCENT[p] : undefined;
              }}
              caption={`${title} — ${def.label.toLowerCase()}`}
              empty={emptyFor(def.key)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
