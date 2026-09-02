'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Paperclip, Download } from 'lucide-react';
import {
  ticketApi,
  attachmentsApi,
  commentsApi,
  triageApi,
  adminApi,
  sitesApi,
  categoriesApi,
  uploadAttachment,
  Ticket,
  Attachment,
  Comment,
  Site,
  Category,
} from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { StatusBadge } from '@/components/app/status-badge';
import { PriorityBadge, PRIORITIES, Priority, priorityLabel } from '@/components/app/priority-badge';
import { TicketTimeline, HistoryEntry } from '@/components/app/ticket-timeline';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDialog, Field } from '@/components/ui/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Selected-chip styling per priority — spelled out so Tailwind keeps the classes. */
const PRIORITY_CHIP: Record<Priority, string> = {
  low: 'border-priority-low/60 bg-priority-low/10 text-priority-low',
  medium: 'border-priority-medium/60 bg-priority-medium/10 text-priority-medium',
  high: 'border-priority-high/60 bg-priority-high/10 text-priority-high',
  urgent: 'border-priority-urgent/60 bg-priority-urgent/10 text-priority-urgent',
};

/**
 * Plain-language "what happens next" for the requester, who is often
 * non-technical and mostly wants to know whether they need to do anything.
 * pending_confirmation is deliberately absent — that case gets its own panel.
 */
const NEXT_STEP: Record<string, string> = {
  new: 'Support is reviewing this and will send it to the right team. Nothing for you to do yet.',
  assigned: 'A team member has picked this up. They will post updates here.',
  in_progress: 'Someone is working on this now. You will see updates here.',
  pending: 'The team is waiting on something before they can carry on.',
  resolved: 'The team has finished. We will ask you to confirm it is fixed.',
  closed: 'This ticket is closed. Add a comment below if the problem comes back.',
  reopened: 'This went back to the same team member to look at again.',
};

function absoluteTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One label/value pair in the detail grid. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Detail-shaped loading state — the page is a header card, not a table. */
function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-4 w-16" />
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-72" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-44" />
    </div>
  );
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUser();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState('');
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeComment, setDisputeComment] = useState('');
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState<Priority | ''>('');
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteDraft, setSiteDraft] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newCommentInternal, setNewCommentInternal] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = user.is_admin || user.is_support_triage || !!user.team_id;
  /** Executives read; they never write (Admin outranks the flag). */
  const readOnlyViewer = user.is_executive && !user.is_admin;
  /** FR-11.3: site correction is Support/Triage only — not Admin, Manager or Member. */
  const canCorrectSite = user.is_support_triage && !readOnlyViewer;

  const loadAttachments = () =>
    attachmentsApi.list(params.id).then((res) => setAttachments(res.data.data || []));

  const loadComments = () => commentsApi.list(params.id).then((res) => setComments(res.data.data || []));

  /** FR-8.2 audit trail. Kept off the main chain so a history failure can't blank the ticket. */
  const loadHistory = () =>
    ticketApi
      .history(params.id)
      .then((res) => {
        setHistory(res.data.data || []);
        setHistoryFailed(false);
      })
      .catch(() => setHistoryFailed(true));

  const load = () =>
    ticketApi
      .get(params.id)
      .then((res) => setTicket(res.data.data))
      .then(() => loadComments())
      .then(() => loadAttachments())
      .then(() => loadHistory())
      .catch(() => setError('Ticket not found or you do not have access to it.'));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Reference data only the people who can act on it need to load.
  useEffect(() => {
    if (canCorrectSite) {
      sitesApi
        .list()
        .then((res) => setSites(res.data.data || []))
        .catch(() => setSites([]));
    }
    if (user.manages_team_id) {
      categoriesApi
        .list()
        .then((res) => setCategories(res.data.data || []))
        .catch(() => setCategories([]));
    }
  }, [canCorrectSite, user.manages_team_id]);

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

  /**
   * FR-2.9: Support/Triage and Admin can set priority on any ticket; a Manager
   * only on their own team's, which is the team behind the confirmed category.
   * Mirrors the server check — team_id (membership) is never manager authority.
   */
  const categoryTeamId = ticket?.confirmed_category_id
    ? categories.find((c) => c.id === ticket.confirmed_category_id)?.team_id
    : undefined;
  const canChangePriority =
    !readOnlyViewer &&
    (user.is_admin ||
      user.is_support_triage ||
      (!!user.manages_team_id && !!categoryTeamId && categoryTeamId === user.manages_team_id));

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
    return <DetailSkeleton />;
  }

  if (error || !ticket) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {error || 'Ticket not found or you do not have access to it.'}
      </div>
    );
  }

  const needsConfirmation = isRequester && ticket.status === 'pending_confirmation';
  const priorityAction = ticket.confirmed_priority ? 'Change priority' : 'Confirm priority';
  const nextStep =
    ticket.status === 'pending' && ticket.pending_reason
      ? `The team is waiting on: ${ticket.pending_reason}`
      : NEXT_STEP[ticket.status];
  const activeSites = sites.filter((s) => s.active !== false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Back
      </button>

      {needsConfirmation && (
        <div className="rounded-lg border border-status-blue/30 bg-status-blue/5 p-6 shadow-card">
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

      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{ticket.subject}</h1>
          </div>
          <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} createdAt={ticket.created_at} />
        </div>

        {isRequester && !needsConfirmation && nextStep && (
          <p className="mt-4 rounded-md bg-surface-raised px-3 py-2 text-sm text-muted-foreground">{nextStep}</p>
        )}

        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{ticket.description}</p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-5 sm:grid-cols-3">
          <Meta label="Site">
            <span className="flex flex-wrap items-center gap-2">
              {ticket.site_name ?? '—'}
              {canCorrectSite && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setSiteDraft(ticket.site_id);
                    setSiteModalOpen(true);
                  }}
                >
                  Correct site
                </Button>
              )}
            </span>
          </Meta>

          <Meta label="Category">{ticket.category_name ?? 'Support will confirm this'}</Meta>

          <Meta label="Priority">
            <span className="flex flex-wrap items-center gap-2">
              {ticket.confirmed_priority ? (
                <PriorityBadge priority={ticket.confirmed_priority} />
              ) : ticket.suggested_priority ? (
                <PriorityBadge priority={ticket.suggested_priority} suggested />
              ) : (
                <span className="text-muted-foreground">Not set yet</span>
              )}
              {canChangePriority && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setPriorityDraft(ticket.confirmed_priority ?? ticket.suggested_priority ?? '');
                    setPriorityModalOpen(true);
                  }}
                >
                  {priorityAction}
                </Button>
              )}
            </span>
          </Meta>

          <Meta label="Requester">{ticket.requester_name ?? '—'}</Meta>

          <Meta label="Assignee">
            {ticket.assignee_name ?? <span className="text-muted-foreground">Not assigned yet</span>}
          </Meta>

          <Meta label="Created">
            <span title={absoluteTime(ticket.created_at)}>{relativeTime(ticket.created_at)}</span>
          </Meta>

          <Meta label="Last update">
            <span title={absoluteTime(ticket.updated_at)}>{relativeTime(ticket.updated_at)}</span>
          </Meta>
        </dl>

        {isAssignee && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
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

      <Section
        title="Attachments"
        action={
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Add file'}
          </Button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files attached yet. Add a photo or screenshot if it helps.</p>
        ) : (
          <ul className="space-y-2">
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
                  className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
                  aria-label={`Download ${a.original_filename}`}
                >
                  <Download className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Comments">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet. Add anything that might help.</p>
        ) : (
          <ul className="space-y-3">
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

        <div className="mt-4 space-y-2 border-t border-border-subtle pt-4">
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
      </Section>

      {/* FR-8.2: every status change, assignment and reassignment, with who and when. */}
      <Section title="History">
        {historyFailed ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the history. Refresh the page to try again.</p>
        ) : (
          <TicketTimeline entries={history} />
        )}
      </Section>

      <FormDialog
        open={priorityModalOpen}
        onOpenChange={setPriorityModalOpen}
        title={priorityAction}
        description={
          ticket.suggested_priority && !ticket.confirmed_priority
            ? `The requester suggested ${priorityLabel(ticket.suggested_priority)}. Priority is a label for the team — it does not change who the ticket is assigned to.`
            : 'Priority is a label for the team — it does not change who the ticket is assigned to.'
        }
        submitLabel={priorityAction}
        submitDisabled={!priorityDraft}
        onSubmit={async () => {
          if (!priorityDraft) return false;
          try {
            await triageApi.confirmPriority(ticket.id, priorityDraft);
            toast.success(`Priority set to ${priorityLabel(priorityDraft)}`);
            await load();
          } catch {
            toast.error('Could not change the priority. You may not have permission on this ticket.');
            return false;
          }
        }}
      >
        <Field label="Priority" hint="Pick the level that matches how much this is disrupting work.">
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => {
              const selected = priorityDraft === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPriorityDraft(p)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                    selected ? PRIORITY_CHIP[p] : 'border-border bg-secondary text-foreground hover:bg-accent',
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', selected ? 'bg-current' : 'bg-muted-foreground')}
                    aria-hidden="true"
                  />
                  {priorityLabel(p)}
                </button>
              );
            })}
          </div>
        </Field>
      </FormDialog>

      <FormDialog
        open={siteModalOpen}
        onOpenChange={setSiteModalOpen}
        title="Correct site"
        description="Use this when a ticket was raised against the wrong site. The change is recorded in the history."
        submitLabel="Correct site"
        submitDisabled={!siteDraft || siteDraft === ticket.site_id}
        onSubmit={async () => {
          if (!siteDraft || siteDraft === ticket.site_id) return false;
          try {
            await adminApi.ticketSite.correct(ticket.id, siteDraft);
            toast.success('Site corrected');
            await load();
          } catch {
            toast.error('Could not correct the site. Try again, or pick a different site.');
            return false;
          }
        }}
      >
        <Field label="Site" htmlFor="correct-site" required hint="Only active sites can be used.">
          <Select value={siteDraft} onValueChange={setSiteDraft}>
            <SelectTrigger id="correct-site">
              <SelectValue placeholder="Choose the right site" />
            </SelectTrigger>
            <SelectContent>
              {activeSites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.region ? ` — ${s.region}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>

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
