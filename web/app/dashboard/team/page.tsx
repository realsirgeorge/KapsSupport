'use client';

import { useEffect, useMemo, useState } from 'react';
import { teamApi, Ticket } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useSearch } from '@/components/app/search-context';
import { StatCard } from '@/components/app/stat-card';
import { StatusBadge } from '@/components/app/status-badge';
import { WorkloadBar } from '@/components/app/workload-bar';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ageLabel } from '@/lib/format';
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
  const { query } = useSearch();
  const teamId = user.manages_team_id!;

  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reassignTarget, setReassignTarget] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = () =>
    Promise.all([teamApi.getStats(teamId), teamApi.getWorkload(teamId), teamApi.getTickets(teamId, { limit: 50 })]).then(
      ([statsRes, workloadRes, ticketsRes]) => {
        setStats(statsRes.data.data);
        setMembers(workloadRes.data.data || []);
        setTickets(ticketsRes.data.data || []);
      },
    );

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [teamId]);

  const reassign = async (ticketId: string, assigneeId: string) => {
    setReassignTarget(null);
    try {
      await teamApi.reassign(ticketId, assigneeId);
      toast.success('Ticket reassigned');
      await load();
    } catch {
      toast.error('Could not reassign — check the member is on this team and available');
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return tickets;
    const q = query.toLowerCase();
    return tickets.filter((t) => t.ticket_number.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  }, [tickets, query]);

  const maxWorkload = Math.max(1, ...members.map((m) => m.open_tickets));

  if (isLoading || !stats) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Team dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of tickets assigned to your team</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Open team tickets" value={stats.open_tickets} primary />
        <StatCard label="Avg resolution time" value={`${stats.avg_resolution_hours.toFixed(1)}h`} />
        <StatCard label="Aging (>3 days)" value={stats.aging_over_3_days} />
        <StatCard label="Team members" value={stats.team_size} />
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team workload</p>
        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          {members.map((m) => (
            <WorkloadBar key={m.id} label={m.name} value={m.open_tickets} max={maxWorkload} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team tickets</p>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
            No tickets match.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Ticket</th>
                  <th className="px-6 py-3 font-medium">Subject</th>
                  <th className="px-6 py-3 font-medium">Assignee</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Age</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{ticket.ticket_number}</td>
                    <td className="px-6 py-3 text-foreground">{ticket.subject}</td>
                    <td className="px-6 py-3 text-muted-foreground">{ticket.assignee_name ?? '—'}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} createdAt={ticket.created_at} />
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{ageLabel(ticket.created_at)}</td>
                    <td className="px-6 py-3">
                      {reassignTarget === ticket.id ? (
                        <Select onValueChange={(assigneeId) => reassign(ticket.id, assigneeId)}>
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue placeholder="Choose member" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id} disabled={m.is_unavailable}>
                                {m.name} {m.is_unavailable ? '(unavailable)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setReassignTarget(ticket.id)}>
                          Reassign
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
