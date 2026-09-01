'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Paperclip, Download } from 'lucide-react';
import { ticketApi, attachmentsApi, commentsApi, uploadAttachment, Ticket, Attachment, Comment } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { StatusBadge } from '@/components/app/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/format';
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState('');
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeComment, setDisputeComment] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newCommentInternal, setNewCommentInternal] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = user.is_admin || user.is_support_triage || !!user.team_id;

  const loadAttachments = () =>
    attachmentsApi.list(params.id).then((res) => setAttachments(res.data.data || []));

  const loadComments = () => commentsApi.list(params.id).then((res) => setComments(res.data.data || []));

  const load = () =>
    ticketApi
      .get(params.id)
      .then((res) => setTicket(res.data.data))
      .then(() => loadComments())
      .then(() => loadAttachments())
      .catch(() => setError('Ticket not found or you do not have access to it.'));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const failures: string[] = [];
    for (const file of Array.from(fileList)) {
      try {
        await uploadAttachment(params.id, file);
      } catch {
        failures.push(file.name);
      }
    }
    if (failures.length) {
      toast.error(`Couldn't upload: ${failures.join(', ')}`);
    } else {
      toast.success('Uploaded');
    }
    await loadAttachments();
    setUploading(false);
  };

  const download = async (attachment: Attachment) => {
    try {
      const res = await attachmentsApi.getDownloadUrl(attachment.id);
      window.open(res.data.data.url, '_blank');
    } catch {
      toast.error('Could not get a download link');
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await commentsApi.add(params.id, newComment.trim(), newCommentInternal);
      setNewComment('');
      setNewCommentInternal(false);
      await loadComments();
    } catch {
      toast.error('Could not post comment');
    } finally {
      setPostingComment(false);
    }
  };

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

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : '+ Add file'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
        {attachments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No files attached yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  {a.original_filename}
                  {a.status === 'pending' && <Badge variant="amber">Scanning</Badge>}
                </span>
                <button
                  onClick={() => download(a)}
                  disabled={a.status === 'pending'}
                  className="text-muted-foreground hover:text-primary disabled:opacity-40"
                  aria-label={`Download ${a.original_filename}`}
                >
                  <Download className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Comments</h2>

        {comments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className={c.is_internal ? 'rounded-md border border-status-amber/30 bg-status-amber/5 p-3' : 'rounded-md bg-secondary p-3'}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author_name ?? 'Someone'}</span>
                  {c.is_internal && <Badge variant="amber">Internal note</Badge>}
                  <span>· {relativeTime(c.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={isRequester ? 'Add a reply...' : 'Add a comment...'}
            rows={2}
          />
          <div className="flex items-center justify-between">
            {isStaff ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={newCommentInternal}
                  onChange={(e) => setNewCommentInternal(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-[hsl(var(--primary))]"
                />
                Internal note (requester won&apos;t see this)
              </label>
            ) : (
              <span />
            )}
            <Button size="sm" disabled={postingComment || !newComment.trim()} onClick={postComment}>
              Post
            </Button>
          </div>
        </div>
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
