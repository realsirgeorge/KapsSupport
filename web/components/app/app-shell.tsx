'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Search, LogOut, CircleDot } from 'lucide-react';
import { authApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  navSections,
  navBadgeValue,
  needsAttentionCount,
  roleLabel,
  primaryRoute,
  type CurrentUser,
} from './nav-config';
import { useSearch } from './search-context';
import { useCounters } from './counters-context';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Hint } from '@/components/ui/tooltip';
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
  const { query, setQuery } = useSearch();
  const counters = useCounters();

  const allItems = sections.flatMap((s) => s.items);
  const activeItem = allItems.find(
    (item) => pathname === item.href || pathname?.startsWith(item.href + '/'),
  );
  const attention = needsAttentionCount(user, counters);

  const handleLogout = async () => {
    await authApi.logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ---------- Sidebar ---------- */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-sunken">
        <div className="px-5 py-5">
          <Link
            href={primaryRoute(user)}
            className="inline-flex items-center gap-2 rounded-md text-[15px] font-bold tracking-tight"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[13px] font-black text-primary-foreground">
              S
            </span>
            <span>
              <span className="text-primary">Support</span>
              <span className="text-foreground">Desk</span>
            </span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-6 px-3" aria-label="Main">
          {sections.map((section, i) => (
            <div key={i}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {section.heading ?? (i === 0 ? 'Menu' : '')}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                  const badge = navBadgeValue(item, counters);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
                      )}
                    >
                      {/* Active marker as a real element rather than a border, so it
                          aligns with the rounded background instead of the row edge. */}
                      {active && (
                        <span
                          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{item.label}</span>
                      {badge !== null && (
                        <span
                          className={cn(
                            'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular',
                            active
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground group-hover:text-foreground',
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

        {/* Signed-in user + real availability state */}
        <div className="mt-6 border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
            <Avatar name={user.name || user.email} size="md" emphasis />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user.name || user.email}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    user.is_unavailable ? 'bg-status-gray' : 'bg-status-green',
                  )}
                  aria-hidden="true"
                />
                {user.is_unavailable ? 'Unavailable' : 'Available'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-background/80 px-8 py-3 backdrop-blur-sm">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="hidden shrink-0 text-sm md:block">
            <ol className="flex items-center gap-2 text-muted-foreground">
              <li className="font-medium uppercase tracking-wider text-[11px]">
                {roleLabel(user)}
              </li>
              {activeItem && (
                <>
                  <li aria-hidden="true" className="text-border-strong">
                    /
                  </li>
                  <li className="font-semibold text-foreground">{activeItem.label}</li>
                </>
              )}
            </ol>
          </nav>

          <div className="relative ml-auto w-full max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets…"
              aria-label="Search tickets on this page"
              className="h-9 pl-9"
            />
          </div>

          <Hint
            label={
              attention
                ? `${attention} ${attention === 1 ? 'item needs' : 'items need'} your attention`
                : 'Nothing needs your attention'
            }
          >
            <Link
              href={primaryRoute(user)}
              aria-label={
                attention ? `${attention} items need your attention` : 'Nothing needs your attention'
              }
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {attention !== null && attention > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-red px-1 text-[10px] font-bold leading-none text-white">
                  {attention > 9 ? '9+' : attention}
                </span>
              )}
            </Link>
          </Hint>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={user.name || user.email} size="sm" emphasis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block truncate font-medium text-foreground">
                  {user.name || user.email}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <CircleDot className="h-3 w-3" aria-hidden="true" />
                  {roleLabel(user)}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-auto px-8 py-7">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
