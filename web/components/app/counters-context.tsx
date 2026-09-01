'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { dashboardApi } from '@/lib/api-client';

/** Union of every role-shaped /me/counters response — each role only ever populates its own subset. */
export interface Counters {
  open?: number;
  pending_confirmation?: number;
  closed_this_month?: number;
  assigned_open?: number;
  pending_blocked?: number;
  resolved_this_week?: number;
  awaiting_category?: number;
  awaiting_assignment?: number;
  assigned_today?: number;
  team_open?: number;
  my_requests_open?: number;
  total_open?: number;
  aging_over_3_days?: number;
  resolved_this_month?: number;
  avg_resolution_hours?: number;
}

const CountersContext = createContext<Counters | null>(null);

export function CountersProvider({ children }: { children: React.ReactNode }) {
  const [counters, setCounters] = useState<Counters | null>(null);

  useEffect(() => {
    dashboardApi
      .counters()
      .then((res) => setCounters(res.data.data))
      .catch(() => setCounters({}));
  }, []);

  return <CountersContext.Provider value={counters}>{children}</CountersContext.Provider>;
}

/** Returns null while the initial fetch is still in flight. */
export function useCounters(): Counters | null {
  return useContext(CountersContext);
}
