'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Completes an implicit-flow sign-in.
 *
 * Supabase can hand the session back two ways. PKCE puts a `code` in the query
 * string, which the server reads. The implicit flow -- which is what
 * admin-generated links use -- puts the tokens in a URL FRAGMENT, and a
 * fragment is never sent to a server. The route handler therefore saw no
 * parameters at all and bounced to the login page with an error, while the
 * tokens sat unread in the address bar.
 *
 * This reads them on the client, establishes the session, then sends the user
 * to /home and lets the existing guards route them: no profile goes to signup,
 * unverified goes to the pending screen, verified stays.
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
      window.history.replaceState(null, '', '/auth/callback');
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
