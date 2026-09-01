'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, PauseCircle, CheckCircle2 } from 'lucide-react';
import { ticketApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
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
import { toast } from 'sonner';

const OPEN_STATUSES = new Set(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'reopened']);

export default function AssignedToMePage() {
  const user = useUser();
  const { query } = useSearch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingModal, setPendingModal] = useState<Ticket | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => ticketApi.list({ assigned_to_me: true, limit: 100 }).then((res) => setTickets(res.data.data || []));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const updateStatus = async (ticket: Ticket, status: string, reason?: string) => {
    setBusyId(ticket.id);
    try {
      await ticketApi.updateStatus(ticket.id, status, reason);
      toast.success(`${ticket.ticket_number} updated`);
      await load();
    } catch {
      toast.error('Could not update status');
    } finally {
      setBusyId(null);
    }
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
    return tickets.filter((t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  }, [tickets, query]);

  const counters = useMemo(() => {
    const now = new Date();
    let assignedOpen = 0;
    let pendingBlocked = 0;
    let resolvedThisWeek = 0;
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    for (const t of tickets) {
      if (OPEN_STATUSES.has(t.status)) assignedOpen++;
      if (t.status === 'pending') pendingBlocked++;
      if (t.resolved_at && new Date(t.resolved_at).getTime() >= weekAgo) resolvedThisWeek++;
    }
    return { assignedOpen, pendingBlocked, resolvedThisWeek };
  }, [tickets]);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader name={user.name} title="Assigned to me" subtitle="Update status as you work through your tickets" />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Assigned to me" value={counters.assignedOpen} icon={Inbox} primary />
        <StatCard label="Pending (blocked)" value={counters.pendingBlocked} icon={PauseCircle} />
        <StatCard label="Resolved this week" value={counters.resolvedThisWeek} icon={CheckCircle2} />
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My assigned tickets</p>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
            {tickets.length === 0 ? 'Nothing assigned to you right now.' : 'No tickets match your search.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ticket) => {
              const busy = busyId === ticket.id;
              return (
                <div key={ticket.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                        {ticket.category_name && <Badge variant="outline">{ticket.category_name}</Badge>}
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-foreground">{ticket.subject}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">{ticket.site_name ?? ''}</p>
                    </div>
                    <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} createdAt={ticket.created_at} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {ticket.status === 'assigned' && (
                      <Button size="sm" disabled={busy} onClick={() => updateStatus(ticket, 'in_progress')}>
                        Start progress
                      </Button>
                    )}
                    {ticket.status === 'pending' && (
                      <Button size="sm" disabled={busy} onClick={() => updateStatus(ticket, 'in_progress')}>
                        Resume progress
                      </Button>
                    )}
                    {ticket.status === 'in_progress' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setPendingModal(ticket);
                            setPendingReason('');
                          }}
                        >
                          Mark pending
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => updateStatus(ticket, 'resolved')}>
                          Mark resolved
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
