'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface SearchContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    setQuery('');
  }, [pathname]);

  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>;
}

/** Client-side search box state, shared between the AppShell's top-bar input and whichever page renders it. */
export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error('useSearch must be used within a SearchProvider (are you inside app/dashboard/layout.tsx?)');
  }
  return ctx;
}
