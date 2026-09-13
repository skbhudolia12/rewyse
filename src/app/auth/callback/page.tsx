import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FragmentHandler } from './fragment-handler';

export const dynamic = 'force-dynamic';

/**
 * Completes the email sign-in link.
 *
 * Handles every shape Supabase can send: `code` (PKCE, what a real emailed link
 * uses), `token_hash` + `type` (older email templates), and -- via the client
 * component below -- tokens in a URL fragment, which is what admin-generated
 * links use and which a server can never see.
 *
 * Where the user lands depends on how far through onboarding they are, so an
 * interrupted signup resumes instead of dropping them into an empty app.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string }>;
}) {
  const { code, token_hash: tokenHash, type } = await searchParams;

  // No query parameters at all means the tokens are in the fragment; only the
  // browser can read those.
  if (!code && !tokenHash) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <FragmentHandler />
      </main>
    );
  }

  const supabase = await createClient();
  let failed = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = error !== null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'magiclink' | 'signup',
      token_hash: tokenHash,
    });
    failed = error !== null;
  }

  if (failed) redirect('/login?error=link_invalid');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('verified_status, banned_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) redirect('/signup/details');
  if (profile.banned_at) redirect('/banned');
  if (profile.verified_status !== 'verified') redirect('/verify');
  redirect('/home');
}
