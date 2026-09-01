'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { authApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { navSections, navBadgeValue, needsAttentionCount, roleLabel, primaryRoute, type CurrentUser } from './nav-config';
import { useSearch } from './search-context';
import { useCounters } from './counters-context';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface AppShellProps {
  user: CurrentUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = navSections(user);
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const { query, setQuery } = useSearch();
  const counters = useCounters();

  const activeItem = sections.flatMap((s) => s.items).find((item) => pathname === item.href || pathname?.startsWith(item.href + '/'));
  const attentionCount = needsAttentionCount(user, counters);

  const handleLogout = async () => {
    await authApi.logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40 px-4 py-6">
        <Link href="/" className="mb-8 px-2 text-lg font-bold tracking-tight">
          <span className="text-primary">Support</span>
          <span className="text-foreground">Desk</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-6">
          {sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.heading}
                </p>
              )}
              {!section.heading && i === 0 && (
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Menu
                </p>
              )}
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                  const badge = navBadgeValue(item, counters);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary/10 font-semibold text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <span>{item.label}</span>
                      {badge !== null && (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                            active ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground',
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{user.name || user.email}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', user.is_unavailable ? 'bg-status-gray' : 'bg-status-green')} />
                {user.is_unavailable ? 'Unavailable' : 'Available'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border bg-card/40 px-8 py-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">SupportDesk</span>
            {activeItem && (
              <>
                <span className="mx-2">/</span>
                <span>{activeItem.label}</span>
              </>
            )}
          </div>

          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets..."
              className="max-w-sm"
            />
          </div>

          <Link
            href={primaryRoute(user)}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={attentionCount ? `${attentionCount} items need attention` : 'Notifications'}
          >
            <Bell className="h-4 w-4" />
            {attentionCount !== null && attentionCount > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-status-red text-[10px] font-bold text-white">
                {attentionCount > 9 ? '9+' : attentionCount}
              </span>
            )}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-3 rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {roleLabel(user)}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {initial}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.name || user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
