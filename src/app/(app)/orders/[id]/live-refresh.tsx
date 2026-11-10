'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Re-renders the order page whenever its payment row changes, so the tracker
 * moves while the buyer watches. RLS scopes the realtime stream: a party only
 * receives changes to payments they are on.
 */
export function LiveRefresh({ paymentId }: { paymentId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`payment:${paymentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${paymentId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [paymentId, router]);

  return null;
}
