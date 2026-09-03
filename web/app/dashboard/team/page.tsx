'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, Clock, AlertTriangle, Users, SearchX, Undo2 } from 'lucide-react';
import { teamApi, ticketApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { PriorityBadge, PRIORITY_ACCENT, isPriority } from '@/components/app/priority-badge';
import { WorkloadBar } from '@/components/app/workload-bar';
import { ActivityFeed } from '@/components/app/activity-feed';
import { Section } from '@/components/ui/section';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Hint } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ageLabel } from '@/lib/format';
import type { ActivityEntry } from '@/lib/activity';
import { toast } from 'sonner';

interface Stats {
  open_tickets: number;
  avg_resolution_hours: number;
  aging_over_3_days: number;
  team_size: number;
  per_member: Array<{ user_id: string; name: string; open_tickets: number }>;
}

interface Member {
  id: string;
  name: string;
  is_unavailable: boolean;
  open_tickets: number;
}

export default function TeamDashboardPage() {
  const user = useUser();
  const allowed = useRequireRole(!!user.manages_team_id);
  const { query } = useSearch();
  const teamId = user.manages_team_id ?? '';

  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [reassignTarget, setReassignTarget] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<Ticket | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const load = () =>
    Promise.allSettled([
      teamApi.getStats(teamId),
      teamApi.getWorkload(teamId),
      teamApi.getTickets(teamId, { limit: 100 }),
      ticketApi.recentActivity(8),
    ]).then(([statsRes, workloadRes, ticketsRes, activityRes]) => {
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data);
      if (workloadRes.status === 'fulfilled') setMembers(workloadRes.value.data.data || []);
      if (ticketsRes.status === 'fulfilled') setTickets(ticketsRes.value.data.data || []);
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value.data.data || []);
    });

  useEffect(() => {
    if (!allowed) return;
    load().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, teamId]);

  const reassign = async (ticketId: string, assigneeId: string) => {
    setReassignTarget(null);
    try {
      await teamApi.reassign(ticketId, assigneeId);
      toast.success('Ticket reassigned');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not reassign this ticket');
    }
  };

  /** FR-3.3: hand a misrouted ticket back to Support/Triage. */
  const returnToTriage = async () => {
    if (!returnTarget) return;
    try {
      await teamApi.returnToTriage(returnTarget.id, returnReason.trim() || undefined);
      toast.success(`${returnTarget.ticket_number} sent back to triage`);
      setReturnReason('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not return this ticket');
      throw err; // keeps ConfirmDialog open so the manager sees it failed
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter(
      (t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
    );
  }, [tickets, query]);

  const maxWorkload = Math.max(1, ...members.map((m) => m.open_tickets));

  const columns: Column<Ticket>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      width: 'w-36',
      cell: (t) => <span className="whitespace-nowrap font-mono text-xs text-primary">{t.ticket_number}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      cell: (t) => <span className="font-medium text-foreground">{t.subject}</span>,
    },
    {
      key: 'assignee',
      header: 'Assignee',
      hideBelowLg: true,
      cell: (t) => <span className="text-muted-foreground">{t.assignee_name ?? 'Unassigned'}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      width: 'w-28',
      cell: (t) => <PriorityBadge priority={t.confirmed_priority ?? t.suggested_priority} suggested={!t.confirmed_priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => (
        <StatusBadge status={t.status} pendingReason={t.pending_reason} createdAt={t.created_at} />
      ),
    },
    {
      key: 'age',
      header: 'Age',
      width: 'w-20',
      cell: (t) => <span className="tabular text-muted-foreground">{ageLabel(t.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-64',
      cell: (t) =>
        reassignTarget === t.id ? (
          <Select onValueChange={(assigneeId) => reassign(t.id, assigneeId)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Choose a member" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                // FR-10.5: unavailable members remain visible but unselectable.
                <SelectItem key={m.id} value={m.id} disabled={m.is_unavailable}>
                  {m.name}
                  {m.is_unavailable ? ' — unavailable' : ` — ${m.open_tickets} open`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setReassignTarget(t.id)}>
              Reassign
            </Button>
            <Hint label="Send this back to Support/Triage — use it when the ticket belongs to a different team entirely.">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Return ${t.ticket_number} to triage`}
                onClick={() => {
                  setReturnReason('');
                  setReturnTarget(t);
                }}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Hint>
          </span>
        ),
    },
  ];

  if (!allowed || isLoading || !stats) {
    return <PageSkeleton stats={4} rows={5} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Team dashboard"
        subtitle="Every ticket routed to your team, whoever is holding it"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open team tickets" value={stats.open_tickets} icon={Inbox} primary />
        <StatCard label="Avg resolution time" value={`${stats.avg_resolution_hours.toFixed(1)}h`} icon={Clock} />
        <StatCard
          label="Aging (>3 days)"
          value={stats.aging_over_3_days}
          icon={AlertTriangle}
          hint={stats.aging_over_3_days > 0 ? 'Needs attention' : undefined}
          hintTone={stats.aging_over_3_days > 0 ? 'amber' : 'default'}
        />
        <StatCard label="Team members" value={stats.team_size} icon={Users} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Live activity">
          <ActivityFeed entries={activity} />
        </Section>
        <Section title="Team workload">
          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              size="compact"
              title="No one is on this team yet"
              description="Add members on the Users & roles screen before assigning work."
            />
          ) : (
            <div className="space-y-3">
              {members.map((m) => (
                <WorkloadBar
                  key={m.id}
                  label={m.is_unavailable ? `${m.name} (unavailable)` : m.name}
                  value={m.open_tickets}
                  max={maxWorkload}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Team tickets" bare>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(t) => t.id}
          accent={(t) => {
            const p = t.confirmed_priority ?? t.suggested_priority;
            return isPriority(p) ? PRIORITY_ACCENT[p] : undefined;
          }}
          empty={
            tickets.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No tickets for your team yet"
                description="Tickets appear here once Support/Triage confirms a category that belongs to your team."
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No tickets match your search"
                description={`Nothing on your team matches "${query.trim()}".`}
              />
            )
          }
        />
      </Section>

      <ConfirmDialog
        open={!!returnTarget}
        onOpenChange={(o) => !o && setReturnTarget(null)}
        title={`Return ${returnTarget?.ticket_number ?? 'this ticket'} to triage?`}
        description="It leaves your team, loses its category and assignee, and goes back to the Support/Triage queue to be routed again. Use this when the ticket belongs to a different team entirely."
        confirmLabel="Return to triage"
        onConfirm={returnToTriage}
      >
        <div className="space-y-1.5">
          <Label htmlFor="return-reason">Reason (optional)</Label>
          <Textarea
            id="return-reason"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="e.g. this is a network issue, not a fintech one"
            rows={2}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
