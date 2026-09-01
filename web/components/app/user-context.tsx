'use client';

import { createContext, useContext } from 'react';
import type { CurrentUser } from './nav-config';

const UserContext = createContext<CurrentUser | null>(null);

export function UserProvider({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): CurrentUser {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error('useUser must be used within a UserProvider (are you inside app/dashboard/layout.tsx?)');
  }
  return user;
}
