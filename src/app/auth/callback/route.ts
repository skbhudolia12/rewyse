import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Completes the email sign-in link.
 *
 * This MUST stay a Route Handler. Establishing a session means writing auth
 * cookies, and a Server Component cannot set cookies -- the write is silently
 * swallowed, so the exchange appears to succeed, the redirect fires, and the
 * user is bounced straight back to login with no session. Only a Route Handler
 * (or middleware) can persist them.
 *
 * Handles both shapes Supabase sends: `code` (PKCE, what a real emailed link
 * uses) and `token_hash` + `type` (older email templates). The third shape --
 * tokens in a URL fragment, used by admin-generated links -- never reaches a
 * server at all, so it is handed to /auth/finish, which the browser reaches
 * with the fragment still attached.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // No query parameters means the tokens are in the fragment. A redirect keeps
  // it: browsers carry a fragment across hops when the target has none.
  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL('/auth/finish', origin));
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
  } else {
    failed = true;
  }

  if (failed) {
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
