'use client';

import { useEffect, useState } from 'react';
import { triageApi, Ticket } from '@/lib/api-client';
import Link from 'next/link';

export default function TriageQueuePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const response = await triageApi.queue();
        setTickets(response.data.data || []);
      } catch (err) {
        console.error('Failed to load triage queue:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQueue();
  }, []);

  if (isLoading) return <div className="p-6">Loading triage queue...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Triage Queue</h2>
        <p className="mt-2 text-gray-400">Confirm category and assign tickets to team members</p>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg bg-gray-800 p-6 text-center text-gray-400">Queue is empty</div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/dashboard/triage/${ticket.id}`}
              className="block rounded-lg border border-gray-700 bg-gray-800 p-4 hover:border-green-600"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-green-400">{ticket.ticket_number}</span>
                    <span className="rounded bg-yellow-900 px-2 py-1 text-xs font-semibold text-yellow-200">
                      {ticket.status}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-white">{ticket.subject}</h3>
                  <p className="mt-1 text-sm text-gray-400">{ticket.description.substring(0, 100)}...</p>
                </div>
                <div className="text-right text-sm text-gray-400">
                  <div>{new Date(ticket.created_at).toLocaleDateString()}</div>
                  <div className="mt-1 font-semibold text-white">
                    Category: {ticket.confirmed_category_id ? '✓' : '⚠ Unconfirmed'}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
