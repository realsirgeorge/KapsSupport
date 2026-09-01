'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ticketApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/format';

const OPEN_STATUSES = new Set(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'reopened']);

export default function TicketsPage() {
  const user = useUser();
  const { query } = useSearch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Support/Triage and Admin see every ticket here ("All tickets"); everyone
  // else sees only tickets they personally submitted ("My tickets"/"My requests").
  const showAllTickets = user.is_admin || user.is_support_triage;

  useEffect(() => {
    let cancelled = false;
    ticketApi
      .list(showAllTickets ? { limit: 100 } : { mine: true, limit: 100 })
      .then((res) => {
        if (!cancelled) setTickets(res.data.data || []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load tickets');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAllTickets]);

  const filtered = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter(
      (t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
    );
  }, [tickets, query]);

  // Computed client-side from the fetched list, rather than /me/counters —
  // that endpoint's shape is keyed by the user's primary role/queue, not by
  // "counters for the ticket set this particular page is showing".
  const counters = useMemo(() => {
    const now = new Date();
    let open = 0;
    let pendingConfirmation = 0;
    let closedThisMonth = 0;
    for (const t of tickets) {
      if (OPEN_STATUSES.has(t.status)) open++;
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

  const title = showAllTickets ? 'All tickets' : user.team_id || user.manages_team_id ? 'My requests' : 'My tickets';
  const subtitle = showAllTickets
    ? 'Every ticket in the system'
    : "Track requests you've submitted and their status";

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error) {
    return <div className="text-destructive">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!showAllTickets && (
          <Button asChild>
            <Link href="/dashboard/new">+ New ticket</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Open tickets" value={counters.open} primary />
        <StatCard label="Pending confirmation" value={counters.pendingConfirmation} />
        <StatCard label="Closed this month" value={counters.closedThisMonth} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
          {tickets.length === 0 ? 'No tickets yet.' : 'No tickets match your search.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">Ticket</th>
                <th className="px-6 py-3 font-medium">Subject</th>
                <th className="px-6 py-3 font-medium">Category</th>
                {showAllTickets && <th className="px-6 py-3 font-medium">Requester</th>}
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                  <td className="px-6 py-3">
                    <Link
                      href={`/dashboard/tickets/${ticket.id}`}
                      className="font-mono text-sm font-medium text-primary hover:underline"
                    >
                      {ticket.ticket_number}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-foreground">{ticket.subject}</td>
                  <td className="px-6 py-3 text-muted-foreground">{ticket.category_name ?? '—'}</td>
                  {showAllTickets && (
                    <td className="px-6 py-3 text-muted-foreground">{ticket.requester_name ?? '—'}</td>
                  )}
                  <td className="px-6 py-3">
                    <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} createdAt={ticket.created_at} />
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{relativeTime(ticket.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
