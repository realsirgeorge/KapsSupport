'use client';

import { useEffect, useState } from 'react';
import { Inbox, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { dashboardApi, ticketApi } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { WorkloadBar } from '@/components/app/workload-bar';
import { ActivityFeed } from '@/components/app/activity-feed';
import type { ActivityEntry } from '@/lib/activity';

interface SystemData {
  total_open: number;
  aging_over_3_days: number;
  resolved_this_month: number;
  avg_resolution_hours: number;
  by_team: Array<{ team_id: string; team_name: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  pending: 'Pending',
  resolved: 'Resolved',
  pending_confirmation: 'Pending confirmation',
  reopened: 'Reopened',
  closed: 'Closed (30d)',
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

export default function SystemDashboardPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin || user.is_executive);
  const [data, setData] = useState<SystemData | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([dashboardApi.system(), ticketApi.recentActivity(8)])
      .then(([sysRes, activityRes]) => {
        setData(sysRes.data.data);
        setActivity(activityRes.data.data || []);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (!allowed || isLoading || !data) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const maxTeam = Math.max(1, ...data.by_team.map((t) => t.count));

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

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total open tickets" value={data.total_open} icon={Inbox} primary />
        <StatCard label="Aging (>3 days)" value={data.aging_over_3_days} icon={AlertTriangle} />
        <StatCard label="Resolved this month" value={data.resolved_this_month} icon={CheckCircle2} />
        <StatCard label="Avg resolution time" value={`${data.avg_resolution_hours.toFixed(1)}h`} icon={Clock} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live activity</p>
          <div className="rounded-lg border border-border bg-card p-5">
            <ActivityFeed entries={activity} />
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tickets by team</p>
          <div className="space-y-3 rounded-lg border border-border bg-card p-5">
            {data.by_team.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tickets.</p>
            ) : (
              data.by_team.map((t) => <WorkloadBar key={t.team_id} label={t.team_name} value={t.count} max={maxTeam} />)
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tickets by status</p>
        <div className="grid grid-cols-5 gap-4">
          {data.by_status.map((s) => (
            <div key={s.status} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status] ?? 'bg-status-gray'}`} />
                {STATUS_LABELS[s.status] ?? s.status}
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{s.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
