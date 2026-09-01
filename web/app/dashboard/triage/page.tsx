'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, UserPlus, CheckCircle2 } from 'lucide-react';
import { triageApi, teamApi, categoriesApi, dashboardApi, ticketApi, Ticket, Category } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { WorkloadBar } from '@/components/app/workload-bar';
import { ActivityFeed } from '@/components/app/activity-feed';
import { relativeTime } from '@/lib/format';
import type { ActivityEntry } from '@/lib/activity';
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

function TicketRow({
  ticket,
  categories,
  onDone,
}: {
  ticket: Ticket;
  categories: Category[];
  onDone: (ticketId: string) => void;
}) {
  const [confirmedCategoryId, setConfirmedCategoryId] = useState<string | null>(ticket.confirmed_category_id ?? null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);

  const category = categories.find((c) => c.id === (confirmedCategoryId ?? ticket.suggested_category_id));

  useEffect(() => {
    if (!confirmedCategoryId) return;
    const cat = categories.find((c) => c.id === confirmedCategoryId);
    if (!cat) return;
    teamApi.getWorkload(cat.team_id).then((res) => setMembers(res.data.data || []));
  }, [confirmedCategoryId, categories]);

  const confirmCategory = async (categoryId: string) => {
    setBusy(true);
    try {
      await triageApi.confirmCategory(ticket.id, categoryId);
      setConfirmedCategoryId(categoryId);
      toast.success(`Category confirmed for ${ticket.ticket_number}`);
    } catch {
      toast.error('Could not confirm category');
    } finally {
      setBusy(false);
    }
  };

  const assign = async (assigneeId: string) => {
    setBusy(true);
    try {
      await triageApi.assign(ticket.id, assigneeId);
      toast.success(`${ticket.ticket_number} assigned`);
      onDone(ticket.id);
    } catch {
      toast.error('Could not assign — the member may be unavailable or on a different team');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {ticket.ticket_number} · {relativeTime(ticket.created_at)}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{ticket.subject}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{ticket.site_name ?? 'Unknown site'}</p>
        </div>
        {category && (
          <Badge variant={confirmedCategoryId ? 'green' : 'blue'}>
            {category.name}
            {!confirmedCategoryId && ' (suggested)'}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!confirmedCategoryId && ticket.suggested_category_id && (
          <>
            <Button size="sm" disabled={busy} onClick={() => confirmCategory(ticket.suggested_category_id!)}>
              Confirm {category?.name}
            </Button>
            <Select onValueChange={confirmCategory}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Change category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="ml-auto">
          <Select disabled={!confirmedCategoryId || busy} onValueChange={assign}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder={confirmedCategoryId ? 'Assign to team member' : 'Confirm category first'} />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id} disabled={m.is_unavailable}>
                  {m.name} {m.is_unavailable ? '(unavailable)' : `— ${m.open_tickets} open`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function IncomingQueuePage() {
  const user = useUser();
  const { query } = useSearch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [workload, setWorkload] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadQueue = () => {
    return triageApi.queue().then((res) => setTickets(res.data.data || []));
  };

  useEffect(() => {
    Promise.all([loadQueue(), categoriesApi.list(), dashboardApi.counters(), ticketApi.recentActivity(8)])
      .then(([, catsRes, countersRes, activityRes]) => {
        setCategories(catsRes.data.data || []);
        setCounters(countersRes.data.data);
        setActivity(activityRes.data.data || []);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    const teamIds = Array.from(new Set(categories.map((c) => c.team_id)));
    Promise.all(teamIds.map((id) => teamApi.getWorkload(id).then((r) => r.data.data || [])))
      .then((results) => {
        const flat: TeamMember[] = results.flat();
        flat.sort((a, b) => b.open_tickets - a.open_tickets);
        setWorkload(flat.slice(0, 8));
      })
      .catch(() => {});
  }, [categories]);

  const handleDone = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter((t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  }, [tickets, query]);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Incoming queue"
        subtitle="Confirm category and assign each ticket to a named team member"
      />

      {counters && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Awaiting category" value={counters.awaiting_category} icon={Inbox} primary />
          <StatCard label="Awaiting assignment" value={counters.awaiting_assignment} icon={UserPlus} />
          <StatCard label="Assigned today" value={counters.assigned_today} icon={CheckCircle2} />
        </div>
      )}

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Queue</p>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
            {tickets.length === 0 ? 'Queue is empty — nice work.' : 'No tickets match your search.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} categories={categories} onDone={handleDone} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live activity</p>
          <div className="rounded-lg border border-border bg-card p-5">
            <ActivityFeed entries={activity} />
          </div>
        </div>

        {workload.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team workload</p>
            <div className="space-y-3 rounded-lg border border-border bg-card p-5">
              {workload.map((m) => (
                <WorkloadBar key={m.id} label={m.name} value={m.open_tickets} max={workload[0]?.open_tickets || 1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
