'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Completes an implicit-flow sign-in.
 *
 * Supabase's implicit flow returns the session in a URL FRAGMENT, which is
 * never transmitted to a server -- so no route handler can see it. The browser
 * client can, and setSession persists it through the same cookie storage the
 * server reads on the next request.
 *
 * Sends the user to /home afterwards and lets the existing guards route them:
 * no profile goes to signup, unverified to the pending screen, verified stays.
 */
export function FragmentHandler() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // One async path, no early synchronous setState: an absent token is handed
    // to setSession as an empty string and comes back as an error, which keeps
    // every state update behind an await where React wants it.
    void (async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: params.get('access_token') ?? '',
        refresh_token: params.get('refresh_token') ?? '',
      });
      if (cancelled) return;

      if (error) {
        setFailed(true);
        return;
      }

      // Clear the tokens out of the address bar before moving on.
      window.history.replaceState(null, '', '/auth/finish');
      router.replace('/home');
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (failed) {
    return (
      <div className="space-y-3 text-center">
        <p className="font-display text-xl">That sign-in link didn&rsquo;t work</p>
        <p className="text-paper-dim text-sm">It may have expired or already been used.</p>
        <a href="/login" className="text-flame inline-block text-sm underline">
          Get a new link
        </a>
      </div>
    );
  }

  return <p className="text-paper-dim text-sm">Signing you in…</p>;
}
