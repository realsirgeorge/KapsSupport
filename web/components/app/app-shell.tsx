'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { authApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { navSections, roleLabel, type CurrentUser } from './nav-config';
import { useSearch } from './search-context';
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
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'rounded-md border-l-2 px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary/10 font-semibold text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border bg-card/40 px-8 py-4">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets..."
              className="max-w-sm"
            />
          </div>
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
