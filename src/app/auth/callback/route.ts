import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Completes the email sign-in link.
 *
 * Handles both shapes Supabase can send: `code` (PKCE, the default for
 * @supabase/ssr) and `token_hash` + `type` (used when the project's email
 * template still points at the older confirmation URL). Supporting both means a
 * template change in the dashboard cannot silently break sign-in.
 *
 * Where the user lands depends on how far through onboarding they are, so an
 * interrupted signup resumes instead of dropping them into an empty app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const supabase = await createClient();
  let exchangeError: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'magiclink' | 'signup',
      token_hash: tokenHash,
    });
    exchangeError = error?.message ?? null;
  } else {
    exchangeError = 'This sign-in link is malformed.';
  }

  if (exchangeError) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'link_invalid');
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', origin));

  const { data: profile } = await supabase
    .from('profiles')
    .select('verified_status, banned_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return NextResponse.redirect(new URL('/signup/details', origin));
  if (profile.banned_at) return NextResponse.redirect(new URL('/banned', origin));
  if (profile.verified_status !== 'verified') {
    return NextResponse.redirect(new URL('/verify', origin));
  }
  return NextResponse.redirect(new URL('/home', origin));
}
