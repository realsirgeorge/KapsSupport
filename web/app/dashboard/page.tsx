'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api-client';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await authApi.me();
        setUser(response.data.data);
      } catch {
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    await authApi.logout();
    router.push('/login');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="border-b border-gray-700 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="flex">
        <aside className="w-64 border-r border-gray-700 bg-gray-800 p-6">
          <nav className="space-y-2">
            <a
              href="/dashboard/tickets"
              className="block rounded-md bg-green-600 px-4 py-2 text-white font-semibold"
            >
              My Tickets
            </a>
            <a href="/dashboard/new" className="block rounded-md px-4 py-2 text-gray-300 hover:bg-gray-700">
              Create Ticket
            </a>
            {(user?.is_support_triage || user?.is_admin) && (
              <>
                <a
                  href="/dashboard/triage"
                  className="block rounded-md px-4 py-2 text-gray-300 hover:bg-gray-700"
                >
                  Triage Queue
                </a>
              </>
            )}
            {(user?.manages_team_id || user?.is_admin) && (
              <>
                <a
                  href="/dashboard/team"
                  className="block rounded-md px-4 py-2 text-gray-300 hover:bg-gray-700"
                >
                  Team Dashboard
                </a>
              </>
            )}
            {user?.is_admin && (
              <>
                <a
                  href="/dashboard/admin"
                  className="block rounded-md px-4 py-2 text-gray-300 hover:bg-gray-700"
                >
                  Admin Panel
                </a>
              </>
            )}
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="grid gap-6">
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="text-xl font-bold text-white">Welcome</h2>
              <p className="mt-2 text-gray-300">
                Select an option from the sidebar to get started.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
