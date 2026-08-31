'use client';

import { useEffect, useState } from 'react';
import { dashboardApi } from '@/lib/api-client';

interface SystemStats {
  total_open: number;
  by_team: Array<{ team: string; open: number; closed: number }>;
  by_status: Array<{ status: string; count: number }>;
  pending_confirmations: Array<{ ticket_number: string; days_waiting: number }>;
}

export default function SystemDashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await dashboardApi.system();
        // Mock data - would come from API
        setStats({
          total_open: 87,
          by_team: [
            { team: 'Fintech', open: 34, closed: 128 },
            { team: 'Technical', open: 28, closed: 105 },
            { team: 'ICT', open: 25, closed: 92 },
          ],
          by_status: [
            { status: 'new', count: 12 },
            { status: 'assigned', count: 34 },
            { status: 'in_progress', count: 28 },
            { status: 'pending', count: 8 },
            { status: 'pending_confirmation', count: 5 },
          ],
          pending_confirmations: [
            { ticket_number: 'TCK-2026-00841', days_waiting: 5 },
            { ticket_number: 'TCK-2026-00839', days_waiting: 3 },
          ],
        });
      } catch (err) {
        console.error('Failed to load system stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) return <div className="p-6">Loading system dashboard...</div>;
  if (!stats) return <div className="p-6 text-red-400">Failed to load system stats</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">System Dashboard</h2>

      <div className="rounded-lg bg-gray-800 p-6">
        <div className="text-sm text-gray-400">Total Open Tickets</div>
        <div className="mt-2 text-4xl font-bold text-green-400">{stats.total_open}</div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="text-lg font-bold text-white">By Team</h3>
          <div className="mt-4 space-y-3">
            {stats.by_team.map((team) => (
              <div key={team.team} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{team.team}</span>
                <span className="font-semibold text-white">
                  {team.open} open / {team.closed} closed
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="text-lg font-bold text-white">By Status</h3>
          <div className="mt-4 space-y-2">
            {stats.by_status.map((item) => (
              <div key={item.status} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 capitalize">{item.status.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-white">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats.pending_confirmations.length > 0 && (
        <div className="rounded-lg border border-orange-700 bg-orange-900 bg-opacity-20 p-6">
          <h3 className="text-lg font-bold text-orange-300">⚠ Pending Confirmations (Long Wait)</h3>
          <div className="mt-4 space-y-2">
            {stats.pending_confirmations.map((item) => (
              <div key={item.ticket_number} className="flex items-center justify-between">
                <span className="font-mono text-orange-300">{item.ticket_number}</span>
                <span className="text-sm text-orange-400">{item.days_waiting} days waiting</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
