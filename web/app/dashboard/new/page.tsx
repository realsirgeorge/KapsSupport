'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ticketApi } from '@/lib/api-client';

export default function CreateTicketPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    site_id: '',
    suggested_category_id: '',
    suggested_priority: 'medium',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await ticketApi.create({
        subject: formData.subject,
        description: formData.description,
        site_id: formData.site_id,
        suggested_category_id: formData.suggested_category_id || undefined,
        suggested_priority: formData.suggested_priority,
      });

      router.push(`/dashboard/tickets/${response.data.data.id}`);
    } catch (err) {
      setError('Failed to create ticket');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="mb-6 text-2xl font-bold text-white">Create Ticket</h2>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg bg-gray-800 p-6">
        <div>
          <label className="block text-sm font-medium text-gray-300">Subject *</label>
          <input
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            required
            className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            placeholder="Brief description of the issue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">Description *</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
            rows={6}
            className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            placeholder="Detailed description of the issue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">Site *</label>
          <select
            name="site_id"
            value={formData.site_id}
            onChange={handleChange}
            required
            className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white"
          >
            <option value="">Select a site...</option>
            <option value="site-1">Westgate</option>
            <option value="site-2">Downtown</option>
            <option value="site-3">Airport</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Category (Suggested)</label>
            <select
              name="suggested_category_id"
              value={formData.suggested_category_id}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            >
              <option value="">Select category...</option>
              <option value="cat-1">Fintech</option>
              <option value="cat-2">Technical</option>
              <option value="cat-3">ICT</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">Priority (Suggested)</label>
            <select
              name="suggested_priority"
              value={formData.suggested_priority}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {error && <div className="rounded-md bg-red-900 p-3 text-sm text-red-200">{error}</div>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-green-600 px-6 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Ticket'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-600 px-6 py-2 font-semibold text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
