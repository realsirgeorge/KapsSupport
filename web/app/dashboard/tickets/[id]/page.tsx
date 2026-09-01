'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ticketApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { StatusBadge } from '@/components/app/status-badge';
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

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUser();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState('');
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeComment, setDisputeComment] = useState('');

  const load = () =>
    ticketApi
      .get(params.id)
      .then((res) => setTicket(res.data.data))
      .catch(() => setError('Ticket not found or you do not have access to it.'));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const isRequester = ticket?.requester_id === user.id;
  const isAssignee = ticket?.assigned_to === user.id;

  const updateStatus = async (status: string, reason?: string) => {
    if (!ticket) return;
    setBusy(true);
    try {
      await ticketApi.updateStatus(ticket.id, status, reason);
      toast.success('Status updated');
      await load();
    } catch {
      toast.error('Could not update status');
    } finally {
      setBusy(false);
    }
  };

  const confirmResolution = async (action: 'confirm' | 'dispute', comment?: string) => {
    if (!ticket) return;
    setBusy(true);
    try {
      await ticketApi.confirmResolution(ticket.id, action, comment);
      toast.success(action === 'confirm' ? 'Ticket closed — thanks for confirming' : 'Ticket reopened for the same team member');
      await load();
    } catch {
      toast.error('Could not submit your response');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !ticket) {
    return <div className="text-destructive">{error}</div>;
  }

  const needsConfirmation = isRequester && ticket.status === 'pending_confirmation';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </button>

      {needsConfirmation && (
        <div className="rounded-lg border border-status-blue/30 bg-status-blue/5 p-6">
          <h2 className="text-lg font-semibold text-foreground">Was this resolved?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The team marked this ticket resolved. Confirm to close it, or let us know if the issue is still happening.
          </p>
          <div className="mt-4 flex gap-3">
            <Button disabled={busy} onClick={() => confirmResolution('confirm')}>
              Yes, this is resolved
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setDisputeModalOpen(true)}>
              No, still an issue
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</p>
            <h1 className="mt-1 text-xl font-bold text-foreground">{ticket.subject}</h1>
          </div>
          <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} createdAt={ticket.created_at} />
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{ticket.description}</p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Site</dt>
            <dd className="text-foreground">{ticket.site_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd className="text-foreground">{ticket.category_name ?? 'Not yet confirmed'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Requester</dt>
            <dd className="text-foreground">{ticket.requester_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Assignee</dt>
            <dd className="text-foreground">{ticket.assignee_name ?? 'Unassigned'}</dd>
          </div>
        </dl>

        {isAssignee && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            {ticket.status === 'assigned' && (
              <Button size="sm" disabled={busy} onClick={() => updateStatus('in_progress')}>
                Start progress
              </Button>
            )}
            {ticket.status === 'pending' && (
              <Button size="sm" disabled={busy} onClick={() => updateStatus('in_progress')}>
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
                    setPendingModalOpen(true);
                    setPendingReason('');
                  }}
                >
                  Mark pending
                </Button>
                <Button size="sm" disabled={busy} onClick={() => updateStatus('resolved')}>
                  Mark resolved
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={pendingModalOpen} onOpenChange={setPendingModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as pending</DialogTitle>
            <DialogDescription>Let the requester know what you&apos;re waiting on.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" value={pendingReason} onChange={(e) => setPendingReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!pendingReason.trim()}
              onClick={async () => {
                await updateStatus('pending', pendingReason.trim());
                setPendingModalOpen(false);
              }}
            >
              Mark pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeModalOpen} onOpenChange={setDisputeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tell us what&apos;s still wrong</DialogTitle>
            <DialogDescription>This reopens the ticket and sends it back to the same team member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dispute">What&apos;s still happening?</Label>
            <Textarea id="dispute" value={disputeComment} onChange={(e) => setDisputeComment(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!disputeComment.trim()}
              onClick={async () => {
                await confirmResolution('dispute', disputeComment.trim());
                setDisputeModalOpen(false);
              }}
            >
              Reopen ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
