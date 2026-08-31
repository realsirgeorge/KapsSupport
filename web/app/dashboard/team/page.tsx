'use client';

import { useEffect, useState } from 'react';
import { dashboardApi } from '@/lib/api-client';

interface TeamStats {
  open_tickets: number;
  avg_resolution_hours: number;
  aging_over_3_days: number;
  team_size: number;
  per_member: Array<{ user_id: string; name: string; open_tickets: number }>;
}

export default function TeamDashboardPage() {
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Mock team ID - in real app would come from auth context
        const response = await dashboardApi.counters();
        // Would load team stats
        setStats({
          open_tickets: 12,
          avg_resolution_hours: 4.2,
          aging_over_3_days: 2,
          team_size: 6,
          per_member: [
            { user_id: '1', name: 'Alice Johnson', open_tickets: 3 },
            { user_id: '2', name: 'Bob Smith', open_tickets: 2 },
            { user_id: '3', name: 'Carol White', open_tickets: 4 },
          ],
        });
      } catch (err) {
        console.error('Failed to load team stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) return <div className="p-6">Loading team dashboard...</div>;
  if (!stats) return <div className="p-6 text-red-400">Failed to load team stats</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Team Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Open Tickets</div>
          <div className="mt-1 text-3xl font-bold text-green-400">{stats.open_tickets}</div>
        </div>
        <div className="rounded-lg bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Avg Resolution Time</div>
          <div className="mt-1 text-3xl font-bold text-blue-400">{stats.avg_resolution_hours}h</div>
        </div>
        <div className="rounded-lg bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Aging >3 Days</div>
          <div className="mt-1 text-3xl font-bold text-yellow-400">{stats.aging_over_3_days}</div>
        </div>
        <div className="rounded-lg bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Team Size</div>
          <div className="mt-1 text-3xl font-bold text-purple-400">{stats.team_size}</div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="text-lg font-bold text-white">Workload by Member</h3>
        <div className="mt-4 space-y-3">
          {stats.per_member.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between">
              <span className="text-gray-300">{member.name}</span>
              <div className="flex items-center gap-3">
                <div className="h-2 w-32 rounded-full bg-gray-700">
                  <div
                    className="h-full rounded-full bg-green-600"
                    style={{ width: `${(member.open_tickets / stats.open_tickets) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-300">{member.open_tickets}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
