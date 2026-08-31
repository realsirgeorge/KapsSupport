'use client';

import { useEffect, useState } from 'react';
import { ticketApi, Ticket } from '@/lib/api-client';
import Link from 'next/link';

export default function AssignedPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAssigned = async () => {
      try {
        const response = await ticketApi.list({ assigned_to_me: true });
        setTickets(response.data.data || []);
      } catch (err) {
        console.error('Failed to load assigned tickets:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssigned();
  }, []);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      assigned: 'text-blue-400',
      in_progress: 'text-cyan-400',
      pending: 'text-orange-400',
      resolved: 'text-purple-400',
      pending_confirmation: 'text-indigo-400',
    };
    return colors[status] || 'text-gray-400';
  };

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Assigned to Me</h2>
        <p className="mt-2 text-gray-400">Tickets you're currently working on</p>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg bg-gray-800 p-6 text-center text-gray-400">
          No tickets assigned to you
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/dashboard/tickets/${ticket.id}`}
              className="rounded-lg border border-gray-700 bg-gray-800 p-4 hover:border-green-600"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-green-400">{ticket.ticket_number}</span>
                    <span className={`text-sm font-semibold ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-white">{ticket.subject}</h3>
                  {ticket.pending_reason && (
                    <p className="mt-1 text-sm text-orange-400">⏸ {ticket.pending_reason}</p>
                  )}
                </div>
                <button className="rounded-md bg-green-600 px-3 py-1 text-sm font-semibold text-white hover:bg-green-700">
                  Update Status
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
