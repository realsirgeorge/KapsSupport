'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { AppShell } from '@/components/app/app-shell';
import { UserProvider } from '@/components/app/user-context';
import { SearchProvider } from '@/components/app/search-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <UserProvider user={user}>
      <SearchProvider>
        <AppShell user={user}>{children}</AppShell>
      </SearchProvider>
    </UserProvider>
  );
}
