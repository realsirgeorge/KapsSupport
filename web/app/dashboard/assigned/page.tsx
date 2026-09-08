'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, PauseCircle, CheckCircle2, SearchX } from 'lucide-react';
import { ticketApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { PriorityBadge } from '@/components/app/priority-badge';
import { Section } from '@/components/ui/section';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { relativeTime, isOpenStatus } from '@/lib/format';
import { toast } from 'sonner';

/**
 * A Team Member only ever sees tickets assigned to them here (FR-4.1) and,
 * separately, the requests they raised themselves (FR-4.2, on the tickets
 * page). Both scopes are enforced server-side — `assigned_to_me` filters on
 * the authenticated user, so this page cannot widen its own visibility.
 */
const FETCH_LIMIT = 100;

/**
 * Mirrors the server's ticket state machine
 * (api/src/modules/tickets/states/ticket-state-machine.ts). Only transitions
 * the API actually accepts are rendered — anything else would 400 on click.
 * "Mark resolved" sends `resolved`, which the server lands on
 * `pending_confirmation`: the requester closes the ticket, not the member.
 */
const ACTIONS: Record<string, { to: 'in_progress' | 'pending' | 'resolved'; label: string; variant?: 'outline' }[]> = {
  assigned: [
    { to: 'in_progress', label: 'Start progress' },
    { to: 'pending', label: 'Mark pending', variant: 'outline' },
  ],
  reopened: [
    { to: 'in_progress', label: 'Start progress' },
    { to: 'pending', label: 'Mark pending', variant: 'outline' },
  ],
  in_progress: [
    { to: 'resolved', label: 'Mark resolved' },
    { to: 'pending', label: 'Mark pending', variant: 'outline' },
  ],
  pending: [
    { to: 'in_progress', label: 'Resume progress' },
    { to: 'resolved', label: 'Mark resolved', variant: 'outline' },
  ],
};

export default function AssignedToMePage() {
  const user = useUser();
  const { query } = useSearch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingModal, setPendingModal] = useState<Ticket | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Executives are read-only everywhere, even on a ticket that happens to be
  // assigned to them — so the status actions are not rendered at all for them.
  const canWrite = !(user.is_executive && !user.is_admin);

  const load = () =>
    ticketApi.list({ assigned_to_me: true, limit: FETCH_LIMIT }).then((res) => setTickets(res.data.data || []));

  useEffect(() => {
    // Catch only the first load. A refetch after a successful status change
    // failing transiently shouldn't replace the page with an error screen.
    load()
      .catch(() => setError('We could not load your tickets. Refresh the page to try again.'))
      .finally(() => setIsLoading(false));
  }, []);

  const updateStatus = async (ticket: Ticket, status: string, reason?: string) => {
    setBusyId(ticket.id);
    try {
      await ticketApi.updateStatus(ticket.id, status, reason);
      toast.success(
        status === 'resolved'
          ? `${ticket.ticket_number} resolved — waiting on the requester to confirm`
          : `${ticket.ticket_number} updated`,
      );
      await load();
    } catch {
      toast.error('Could not update status');
    } finally {
      setBusyId(null);
    }
  };

  const startAction = (ticket: Ticket, to: string) => {
    // Pending needs a reason (the API rejects it without one), so it routes
    // through the dialog; every other transition applies straight away.
    if (to === 'pending') {
      setPendingModal(ticket);
      setPendingReason('');
      return;
    }
    void updateStatus(ticket, to);
  };

  const submitPending = async () => {
    if (!pendingModal || !pendingReason.trim()) return;
    await updateStatus(pendingModal, 'pending', pendingReason.trim());
    setPendingModal(null);
    setPendingReason('');
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter(
      (t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
    );
  }, [tickets, query]);

  const counters = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let assignedOpen = 0;
    let pendingBlocked = 0;
    let resolvedThisWeek = 0;
    for (const t of tickets) {
      if (isOpenStatus(t.status)) assignedOpen++;
      if (t.status === 'pending') pendingBlocked++;
      if (t.resolved_at && new Date(t.resolved_at).getTime() >= weekAgo) resolvedThisWeek++;
    }
    return { assignedOpen, pendingBlocked, resolvedThisWeek };
  }, [tickets]);

  if (isLoading) {
    return <PageSkeleton stats={3} rows={4} cols={4} />;
  }

  if (error) {
    return <div className="text-destructive">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Assigned to me"
        subtitle="Update status as you work through your tickets"
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Assigned to me" value={counters.assignedOpen} icon={Inbox} primary />
        <StatCard label="Pending (blocked)" value={counters.pendingBlocked} icon={PauseCircle} />
        <StatCard label="Resolved this week" value={counters.resolvedThisWeek} icon={CheckCircle2} />
      </div>

      <Section title="My assigned tickets" bare>
        {filtered.length === 0 ? (
          tickets.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing assigned to you right now"
              description="Tickets routed to your team will appear here once a manager or triage assigns one to you."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No tickets match your search"
              description={`Nothing assigned to you matches "${query.trim()}".`}
            />
          )
        ) : (
          <div className="space-y-3">
            {filtered.map((ticket) => {
              const busy = busyId === ticket.id;
              const actions = canWrite ? ACTIONS[ticket.status] ?? [] : [];
              return (
                <div
                  key={ticket.id}
                  className="rounded-lg border border-border bg-card p-5 shadow-card transition-colors hover:border-border-subtle"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs text-primary">{ticket.ticket_number}</span>
                        {ticket.category_name && <Badge variant="outline">{ticket.category_name}</Badge>}
                        <PriorityBadge priority={ticket.confirmed_priority ?? ticket.suggested_priority} />
                      </div>
                      <h3 className="mt-1.5 text-base font-semibold text-foreground">{ticket.subject}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {[ticket.site_name, ticket.requester_name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge
                        status={ticket.status}
                        pendingReason={ticket.pending_reason}
                        createdAt={ticket.created_at}
                      />
                      <span className="text-xs text-muted-foreground">
                        Updated {relativeTime(ticket.updated_at)}
                      </span>
                    </div>
                  </div>

                  {ticket.status === 'pending' && ticket.pending_reason && (
                    <p className="mt-3 border-l-2 border-status-amber pl-3 text-sm text-muted-foreground">
                      Waiting on: {ticket.pending_reason}
                    </p>
                  )}

                  {actions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                      {actions.map((a) => (
                        <Button
                          key={a.to}
                          size="sm"
                          variant={a.variant}
                          disabled={busy}
                          onClick={() => startAction(ticket, a.to)}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Dialog open={!!pendingModal} onOpenChange={(open) => !open && setPendingModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {pendingModal?.ticket_number} as pending</DialogTitle>
            <DialogDescription>Let the requester know what you&apos;re waiting on.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pending-reason">Reason</Label>
            <Textarea
              id="pending-reason"
              value={pendingReason}
              onChange={(e) => setPendingReason(e.target.value)}
              placeholder="e.g. awaiting vendor, waiting on part delivery"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingModal(null)}>
              Cancel
            </Button>
            <Button onClick={submitPending} disabled={!pendingReason.trim()}>
              Mark pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
