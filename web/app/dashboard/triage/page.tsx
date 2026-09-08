'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, UserPlus, CheckCircle2, MapPin, AlertTriangle, SearchX, PartyPopper } from 'lucide-react';
import {
  triageApi,
  teamApi,
  categoriesApi,
  dashboardApi,
  sitesApi,
  adminApi,
  Ticket,
  Category,
  Site,
} from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { PageHeader } from '@/components/app/page-header';
import { PriorityBadge, PRIORITIES, type Priority } from '@/components/app/priority-badge';
import { Section } from '@/components/ui/section';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { Hint } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDialog, Field } from '@/components/ui/form-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  name: string;
  is_unavailable: boolean;
  open_tickets: number;
}

interface Counters {
  awaiting_category: number;
  awaiting_assignment: number;
  assigned_today: number;
}

interface Team {
  id: string;
  name: string;
}

/** Selected-chip styling per priority — spelled out so Tailwind keeps the classes. */
const PRIORITY_CHIP: Record<Priority, string> = {
  low: 'border-priority-low/60 bg-priority-low/10 text-priority-low',
  medium: 'border-priority-medium/60 bg-priority-medium/10 text-priority-medium',
  high: 'border-priority-high/60 bg-priority-high/10 text-priority-high',
  urgent: 'border-priority-urgent/60 bg-priority-urgent/10 text-priority-urgent',
};

/**
 * One ticket awaiting triage. Holds its own state because each card runs an
 * independent confirm → assign sequence and reloading the whole queue after
 * every keystroke-level action would lose the others' in-progress work.
 */
function QueueCard({
  ticket,
  categories,
  sites,
  onAssigned,
}: {
  ticket: Ticket;
  categories: Category[];
  sites: Site[];
  onAssigned: (ticketId: string) => void;
}) {
  const [confirmedCategoryId, setConfirmedCategoryId] = useState<string | null>(
    ticket.confirmed_category_id ?? null,
  );
  const [confirmedPriority, setConfirmedPriority] = useState<string | null>(
    ticket.confirmed_priority ?? null,
  );
  const [siteName, setSiteName] = useState(ticket.site_name ?? 'Unknown site');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * FR-2.4: set when recategorising moved the ticket to a team the previous
   * assignee isn't on. The server has *already* cleared the assignment and
   * reset the ticket to 'new' — this flag only drives the prompt to pick
   * someone new, it does not mean the category change is still pending.
   */
  const [needsReassignment, setNeedsReassignment] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState<Priority | ''>('');
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteDraft, setSiteDraft] = useState('');

  const suggestedCategory = categories.find((c) => c.id === ticket.suggested_category_id);
  const activeCategory = categories.find((c) => c.id === confirmedCategoryId);

  // Assignee list follows the *confirmed* category's team (FR-2.1a).
  useEffect(() => {
    if (!activeCategory) {
      setMembers([]);
      return;
    }
    teamApi
      .getWorkload(activeCategory.team_id)
      .then((res) => setMembers(res.data.data || []))
      .catch(() => setMembers([]));
  }, [activeCategory]);

  const confirmCategory = async (categoryId: string) => {
    setBusy(true);
    try {
      const res = await triageApi.confirmCategory(ticket.id, categoryId);
      setConfirmedCategoryId(categoryId);
      const required = !!res.data?.meta?.reassignment_required;
      setNeedsReassignment(required);
      toast.success(
        required
          ? `Category changed — ${ticket.ticket_number} needs a new assignee from that team`
          : `Category confirmed for ${ticket.ticket_number}`,
      );
    } catch {
      toast.error('Could not confirm the category');
    } finally {
      setBusy(false);
    }
  };

  const confirmPriority = async () => {
    if (!priorityDraft) return false;
    try {
      await triageApi.confirmPriority(ticket.id, priorityDraft);
      setConfirmedPriority(priorityDraft);
      toast.success(`Priority set to ${priorityDraft} for ${ticket.ticket_number}`);
    } catch {
      toast.error('Could not set the priority');
      return false;
    }
  };

  const correctSite = async () => {
    if (!siteDraft) return false;
    try {
      await adminApi.ticketSite.correct(ticket.id, siteDraft);
      setSiteName(sites.find((s) => s.id === siteDraft)?.name ?? 'Updated');
      toast.success(`Site corrected on ${ticket.ticket_number}`);
    } catch {
      toast.error('Could not correct the site');
      return false;
    }
  };

  const assign = async (assigneeId: string) => {
    setBusy(true);
    try {
      await triageApi.assign(ticket.id, assigneeId);
      toast.success(`${ticket.ticket_number} assigned`);
      onAssigned(ticket.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not assign this ticket');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-5 shadow-card transition-colors',
        needsReassignment ? 'border-status-amber/50' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            <span className="whitespace-nowrap font-mono text-primary">{ticket.ticket_number}</span>
            <span className="mx-1.5">·</span>
            {relativeTime(ticket.created_at)}
            <span className="mx-1.5">·</span>
            {ticket.requester_name ?? 'Unknown requester'}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{ticket.subject}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {siteName}
            {/* FR-11.3 — Support/Triage is the only role permitted to correct a site. */}
            <button
              type="button"
              onClick={() => {
                setSiteDraft('');
                setSiteOpen(true);
              }}
              className="ml-1 rounded text-xs text-primary underline-offset-2 hover:underline"
            >
              Correct
            </button>
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {activeCategory ? (
            <Badge variant="green">{activeCategory.name}</Badge>
          ) : suggestedCategory ? (
            <Badge variant="blue">{suggestedCategory.name} (suggested)</Badge>
          ) : (
            <Badge variant="gray">No category suggested</Badge>
          )}
          {/* FR-2.8: confirmed priority wins; until then show the requester's guess. */}
          {confirmedPriority ? (
            <PriorityBadge priority={confirmedPriority} />
          ) : (
            <PriorityBadge priority={ticket.suggested_priority} suggested />
          )}
        </div>
      </div>

      {needsReassignment && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-status-amber/30 bg-status-amber/5 p-2.5 text-xs text-status-amber">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            The previous assignee isn&apos;t on this category&apos;s team, so this ticket was unassigned
            and put back in the queue. Pick someone from {activeCategory?.name} to continue.
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!confirmedCategoryId && suggestedCategory && (
          <Button size="sm" disabled={busy} onClick={() => confirmCategory(suggestedCategory.id)}>
            Confirm {suggestedCategory.name}
          </Button>
        )}

        <Select onValueChange={confirmCategory} disabled={busy}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder={confirmedCategoryId ? 'Change category' : 'Pick a category'} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setPriorityDraft((confirmedPriority as Priority) || '');
            setPriorityOpen(true);
          }}
        >
          {confirmedPriority ? 'Change priority' : 'Set priority'}
        </Button>

        <div className="ml-auto">
          {/* FR-2.6: assignment is blocked until a category is confirmed — the API
              rejects it otherwise, so explain the gate rather than just greying out. */}
          {confirmedCategoryId ? (
            <Select disabled={busy} onValueChange={assign}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder="Assign to team member" />
              </SelectTrigger>
              <SelectContent>
                {members.length === 0 && (
                  <SelectItem value="__none" disabled>
                    No members on this team
                  </SelectItem>
                )}
                {members.map((m) => (
                  // FR-10.5: unavailable members stay visible but unselectable.
                  <SelectItem key={m.id} value={m.id} disabled={m.is_unavailable}>
                    {m.name}
                    {m.is_unavailable ? ' — unavailable' : ` — ${m.open_tickets} open`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Hint label="A ticket can't be assigned until its category is confirmed — that's what decides which team it goes to.">
              <span className="inline-flex h-8 cursor-not-allowed items-center rounded-md border border-border bg-muted px-3 text-xs text-muted-foreground">
                Confirm a category first
              </span>
            </Hint>
          )}
        </div>
      </div>

      <FormDialog
        open={priorityOpen}
        onOpenChange={setPriorityOpen}
        title={`${confirmedPriority ? 'Change' : 'Set'} priority`}
        description="Priority is a label to help people judge urgency. It doesn't change who the ticket goes to."
        submitLabel={confirmedPriority ? 'Change priority' : 'Set priority'}
        submitDisabled={!priorityDraft}
        onSubmit={confirmPriority}
      >
        <Field label="Priority" hint={`${ticket.requester_name ?? 'The requester'} suggested: ${ticket.suggested_priority ?? 'nothing'}`}>
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
                    'rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                    selected ? PRIORITY_CHIP[p] : 'border-border bg-secondary text-foreground hover:bg-accent',
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </Field>
      </FormDialog>

      <FormDialog
        open={siteOpen}
        onOpenChange={setSiteOpen}
        title="Correct the site"
        description="Only Support/Triage can change which site a ticket belongs to. Historical reporting follows this value."
        submitLabel="Correct site"
        submitDisabled={!siteDraft}
        onSubmit={correctSite}
      >
        <Field label="Site" hint={`Currently: ${siteName}`}>
          <Select value={siteDraft} onValueChange={setSiteDraft}>
            <SelectTrigger>
              <SelectValue placeholder="Pick the right site" />
            </SelectTrigger>
            <SelectContent>
              {/* Inactive sites are rejected by the endpoint, so don't offer them. */}
              {sites
                .filter((s) => s.active)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.region ? ` — ${s.region}` : ''}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>
    </div>
  );
}

export default function IncomingQueuePage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_support_triage || user.is_admin);
  const { query } = useSearch();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roster, setRoster] = useState<Record<string, TeamMember[]>>({});
  const [counters, setCounters] = useState<Counters | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    // Settled, not all: the roster or counters failing shouldn't cost us the queue.
    Promise.allSettled([
      triageApi.queue(),
      categoriesApi.list(),
      dashboardApi.counters(),
      sitesApi.list(),
      adminApi.teams.list(),
    ]).then(([queueRes, catsRes, countersRes, sitesRes, teamsRes]) => {
      if (cancelled) return;
      if (queueRes.status === 'fulfilled') setTickets(queueRes.value.data.data || []);
      if (catsRes.status === 'fulfilled') setCategories(catsRes.value.data.data || []);
      if (countersRes.status === 'fulfilled') setCounters(countersRes.value.data.data);
      if (sitesRes.status === 'fulfilled') setSites(sitesRes.value.data.data || []);
      if (teamsRes.status === 'fulfilled') setTeams(teamsRes.value.data.data || []);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [allowed]);

  // FR-2.3: Support/Triage sees the member roster of *every* team, not just
  // the one team a ticket happens to route to.
  useEffect(() => {
    if (teams.length === 0) return;
    let cancelled = false;
    Promise.all(
      teams.map((t) =>
        teamApi
          .getWorkload(t.id)
          .then((r) => [t.id, (r.data.data || []) as TeamMember[]] as const)
          .catch(() => [t.id, [] as TeamMember[]] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setRoster(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [teams]);

  const handleAssigned = useCallback((ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    setCounters((c) =>
      c ? { ...c, awaiting_assignment: Math.max(0, c.awaiting_assignment - 1), assigned_today: c.assigned_today + 1 } : c,
    );
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter(
      (t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
    );
  }, [tickets, query]);

  if (!allowed || isLoading) {
    return <PageSkeleton stats={3} rows={4} cols={4} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Incoming queue"
        subtitle="Confirm the category and priority, then assign each ticket to a named team member"
      />

      {counters && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Awaiting category" value={counters.awaiting_category} icon={Inbox} primary />
          <StatCard label="Awaiting assignment" value={counters.awaiting_assignment} icon={UserPlus} />
          <StatCard label="Assigned today" value={counters.assigned_today} icon={CheckCircle2} />
        </div>
      )}

      <Section title="Queue" bare>
        {filtered.length === 0 ? (
          tickets.length === 0 ? (
            <EmptyState
              icon={PartyPopper}
              title="The queue is clear"
              description="Every incoming ticket has a confirmed category and an owner. Nothing is waiting on triage."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No tickets match your search"
              description={`Nothing in the queue matches "${query.trim()}".`}
            />
          )
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => (
              <QueueCard
                key={t.id}
                ticket={t}
                categories={categories}
                sites={sites}
                onAssigned={handleAssigned}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Team rosters" bare bodyClassName="grid gap-4 lg:grid-cols-2">
        {teams.map((team) => {
          const members = roster[team.id] ?? [];
          const busiest = Math.max(1, ...members.map((m) => m.open_tickets));
          return (
            <div key={team.id} className="rounded-lg border border-border bg-card p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{team.name}</h3>
                <span className="text-xs text-muted-foreground">
                  <span className="tabular font-medium text-foreground">{members.length}</span>{' '}
                  {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one is on this team yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <Avatar name={m.name} size="xs" />
                      <span
                        className={cn(
                          'flex-1 truncate text-sm',
                          m.is_unavailable ? 'text-muted-foreground' : 'text-foreground',
                        )}
                      >
                        {m.name}
                      </span>
                      {m.is_unavailable && (
                        <Hint label="On approved leave — they stay visible but can't be assigned new tickets.">
                          <Badge variant="gray">Unavailable</Badge>
                        </Hint>
                      )}
                      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((m.open_tickets / busiest) * 100)}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-sm tabular text-muted-foreground">
                        {m.open_tickets}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}
