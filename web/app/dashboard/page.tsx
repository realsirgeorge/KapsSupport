'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/app/user-context';
import { primaryRoute } from '@/components/app/nav-config';

export default function DashboardIndex() {
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    router.replace(primaryRoute(user));
  }, [user, router]);

  return null;
}
