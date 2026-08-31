'use client';

import { useEffect, useState } from 'react';
import { ticketApi, Ticket } from '@/lib/api-client';
import Link from 'next/link';

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const response = await ticketApi.list({ mine: true });
        setTickets(response.data.data || []);
      } catch (err) {
        setError('Failed to load tickets');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTickets();
  }, []);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-yellow-900 text-yellow-200',
      assigned: 'bg-blue-900 text-blue-200',
      in_progress: 'bg-cyan-900 text-cyan-200',
      pending: 'bg-orange-900 text-orange-200',
      resolved: 'bg-purple-900 text-purple-200',
      pending_confirmation: 'bg-indigo-900 text-indigo-200',
      closed: 'bg-green-900 text-green-200',
      reopened: 'bg-red-900 text-red-200',
    };
    return colors[status] || 'bg-gray-700 text-gray-200';
  };

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">My Tickets</h2>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
        >
          Create Ticket
        </Link>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg bg-gray-800 p-6 text-center text-gray-400">
          No tickets yet. Create one to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-gray-800">
          <table className="w-full">
            <thead className="border-b border-gray-700 bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Ticket</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Subject</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-gray-700 hover:bg-gray-700">
                  <td className="px-6 py-3">
                    <Link href={`/dashboard/tickets/${ticket.id}`} className="font-mono text-green-400 hover:underline">
                      {ticket.ticket_number}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-white">{ticket.subject}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${getStatusBadge(ticket.status)}`}>
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
