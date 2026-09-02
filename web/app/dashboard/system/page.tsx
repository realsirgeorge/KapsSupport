'use client';

import { useEffect, useState } from 'react';
import { Inbox, AlertTriangle, CheckCircle2, Clock, HelpCircle, Users } from 'lucide-react';
import { dashboardApi, ticketApi, type Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { WorkloadBar } from '@/components/app/workload-bar';
import { ActivityFeed } from '@/components/app/activity-feed';
import type { ActivityEntry } from '@/lib/activity';
import { monthStartLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

interface SystemData {
  total_open: number;
  aging_over_3_days: number;
  resolved_this_month: number;
  avg_resolution_hours: number;
  by_team: Array<{ team_id: string; team_name: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
}

/** Row of `GET /dashboard/system/pending-confirmations` (oldest wait first). */
interface PendingConfirmation {
  id: string;
  ticket_number: string;
  subject: string;
  assigned_to?: string | null;
  pending_confirmation_days: number;
  /** Merged in client-side — the endpoint returns ids, not names. */
  assignee_name?: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  pending: 'Pending',
  resolved: 'Resolved',
  pending_confirmation: 'Pending confirmation',
  reopened: 'Reopened',
  closed: 'Closed',
};

const STATUS_DOT: Record<string, string> = {
  new: 'bg-status-blue',
  assigned: 'bg-status-blue',
  in_progress: 'bg-status-amber',
  pending: 'bg-status-amber',
  resolved: 'bg-status-blue',
  pending_confirmation: 'bg-status-blue',
  reopened: 'bg-status-red',
  closed: 'bg-status-green',
};

/** Long waits get emphasis, but the number always carries its own text label. */
const LONG_WAIT_DAYS = 7;
const VERY_LONG_WAIT_DAYS = 14;

function waitTone(days: number): string {
  if (days >= VERY_LONG_WAIT_DAYS) return 'text-status-red';
  if (days >= LONG_WAIT_DAYS) return 'text-status-amber';
  return 'text-foreground';
}

function waitAccent(days: number): string | undefined {
  if (days >= VERY_LONG_WAIT_DAYS) return 'bg-status-red';
  if (days >= LONG_WAIT_DAYS) return 'bg-status-amber';
  return undefined;
}

export default function SystemDashboardPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin || user.is_executive);
  const [data, setData] = useState<SystemData | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [pending, setPending] = useState<PendingConfirmation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Settled rather than all: a failing side panel shouldn't blank the page.
    Promise.allSettled([
      dashboardApi.system(),
      ticketApi.recentActivity(8),
      dashboardApi.pendingConfirmations(),
      // Only source of assignee *names* for these tickets — the pending
      // confirmations endpoint returns assigned_to ids alone.
      ticketApi.list({ status: 'pending_confirmation', limit: 100 }),
    ]).then(([sysRes, activityRes, pendingRes, namesRes]) => {
      if (cancelled) return;

      if (sysRes.status === 'fulfilled') setData(sysRes.value.data.data);
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value.data.data || []);

      if (pendingRes.status === 'fulfilled') {
        const names = new Map<string, string>();
        if (namesRes.status === 'fulfilled') {
          for (const t of (namesRes.value.data.data || []) as Ticket[]) {
            if (t.assigned_to && t.assignee_name) names.set(t.assigned_to, t.assignee_name);
          }
        }
        const rows: PendingConfirmation[] = pendingRes.value.data.data || [];
        setPending(
          rows.map((r) => ({ ...r, assignee_name: r.assigned_to ? names.get(r.assigned_to) : undefined })),
        );
      }

      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed || isLoading) {
    return <PageSkeleton stats={4} rows={5} cols={4} />;
  }

  if (!data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the system dashboard"
        description="The stats request failed. Reload the page to try again."
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    );
  }

  const maxTeam = Math.max(1, ...data.by_team.map((t) => t.count));

  const pendingColumns: Column<PendingConfirmation>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      width: 'w-36',
      cell: (r) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.ticket_number}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      cell: (r) => <span className="font-medium text-foreground">{r.subject}</span>,
    },
    {
      key: 'waiting',
      header: 'Waiting',
      width: 'w-40',
      cell: (r) => {
        const days = r.pending_confirmation_days ?? 0;
        return (
          <span className={cn('tabular font-medium', waitTone(days))}>
            {days} {days === 1 ? 'day' : 'days'}
            {days >= LONG_WAIT_DAYS && <span className="ml-1 font-normal">· long wait</span>}
          </span>
        );
      },
    },
    {
      key: 'assignee',
      header: 'Assignee',
      width: 'w-48',
      hideBelowLg: true,
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.assignee_name ?? (r.assigned_to ? '—' : 'Unassigned')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {user.name.split(' ')[0]}.
        </p>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">System dashboard</h1>
          {user.is_executive && <Badge variant="blue">Exec view · read-only</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">All teams, all sites — full visibility{user.is_executive ? ', no editing for executive role' : ''}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total open tickets" value={data.total_open} icon={Inbox} primary />
        <StatCard
          label="Aging (>3 days)"
          value={data.aging_over_3_days}
          icon={AlertTriangle}
          hint={data.aging_over_3_days > 0 ? 'Needs attention' : undefined}
          hintTone={data.aging_over_3_days > 0 ? 'amber' : 'default'}
        />
        {/*
          This counts tickets whose status is `closed`, not `resolved` — and in
          this system those are two different things: a resolved ticket is still
          waiting on the requester to confirm. Labelling it "Resolved" made the
          card contradict the status vocabulary used everywhere else on the page.
          The window is the calendar month, so early in a month a low number is
          the truth rather than a broken metric; the hint says so.
        */}
        <StatCard
          label="Closed this month"
          value={data.resolved_this_month}
          icon={CheckCircle2}
          hint={`Since ${monthStartLabel()}`}
        />
        <StatCard label="Avg resolution time" value={`${data.avg_resolution_hours.toFixed(1)}h`} icon={Clock} />
      </div>

      <Section
        title="Waiting on requester confirmation"
        subtitle="Visibility only — nothing here closes on its own, and the system takes no action on this list."
        bare
        bodyClassName="space-y-3"
        action={
          pending.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              <span className="tabular font-semibold text-foreground">{pending.length}</span> waiting
            </span>
          ) : undefined
        }
      >
        <DataTable
          columns={pendingColumns}
          rows={pending}
          rowKey={(r) => r.id}
          href={(r) => `/dashboard/tickets/${r.id}`}
          accent={(r) => waitAccent(r.pending_confirmation_days ?? 0)}
          caption="Tickets resolved but not yet confirmed by their requester, longest wait first"
          empty={
            <EmptyState
              icon={CheckCircle2}
              size="compact"
              title="Nothing waiting on a requester"
              description="Every resolved ticket has been confirmed or disputed."
            />
          }
        />
      </Section>

      <div className="grid grid-cols-2 gap-6">
        <Section title="Live activity">
          <ActivityFeed entries={activity} />
        </Section>
        <Section title="Tickets by team" bodyClassName="space-y-3">
          {data.by_team.length === 0 ? (
            <EmptyState
              icon={Users}
              size="compact"
              title="No open tickets"
              description="Nothing is in flight with any team right now."
            />
          ) : (
            data.by_team.map((t) => <WorkloadBar key={t.team_id} label={t.team_name} value={t.count} max={maxTeam} />)
          )}
        </Section>
      </div>

      <Section title="Tickets by status" bare subtitle="Where every ticket in the system is sitting right now">
        {data.by_status.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            size="compact"
            title="No tickets to count"
            description="Status totals appear once tickets are raised."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            {data.by_status.map((s) => (
              <div key={s.status} className="rounded-lg border border-border bg-card p-4 shadow-card">
                {/* items-start, not items-center: "Pending confirmation" wraps
                    to two lines and a vertically-centred dot then floats
                    between them instead of marking the label. */}
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span
                    className={`mt-[0.4rem] h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status] ?? 'bg-status-gray'}`}
                    aria-hidden="true"
                  />
                  {STATUS_LABELS[s.status] ?? s.status}
                </div>
                <p className="mt-2 text-2xl font-bold tabular text-foreground">{s.count}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
