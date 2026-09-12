'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { normalizeEmail, resolveCampusForEmail } from '@/lib/auth/campus-email';
import type { CampusDomain } from '@/lib/auth/campus-email';

export interface AuthFormState {
  error?: string;
  sentTo?: string;
}

/**
 * Sends a sign-in link to a campus email address.
 *
 * Login and signup are the same action on purpose. Splitting them would mean
 * answering "does this address have an account?" to anyone who asks, and would
 * strand any student whose signup was interrupted between confirming their
 * email and filling in their details.
 *
 * This is gate A. It proves two things together: the address is on an
 * allow-listed campus domain, and the person asking can actually read that
 * inbox. Neither alone is sufficient, which is why gate B (ID review) exists.
 */
export async function requestSignInLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = formData.get('email');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { error: 'Enter your college email address.' };
  }

  const email = normalizeEmail(raw);

  // The allow-list is public reference data, but read it with the admin client
  // so an unauthenticated caller still gets a correct answer.
  const admin = createAdminClient();
  const { data: domains, error: domainErr } = await admin
    .from('campus_domains')
    .select('campus_id, domain');

  if (domainErr) {
    return { error: 'Could not verify your campus right now. Please try again.' };
  }

  const campusId = resolveCampusForEmail(email, (domains ?? []) as CampusDomain[]);
  if (!campusId) {
    return {
      error:
        'That is not a recognised campus email. Use your college address from IIIT Delhi, IIT Delhi or DTU.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    // Supabase's own send limit is the likeliest cause during a pilot, and it
    // reads as a generic failure otherwise. Say something actionable.
    if (error.status === 429 || /rate/i.test(error.message)) {
      return { error: 'Too many attempts. Wait a minute and try again.' };
    }
    return { error: `Could not send the link: ${error.message}` };
  }

  return { sentTo: email };
}
