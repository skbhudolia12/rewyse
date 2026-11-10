'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { DEMO_ROLES, DEMO_ROLE_KEYS, demoAccessEnabled, type DemoRole } from '@/lib/demo';

const roleSchema = z.enum(DEMO_ROLE_KEYS as [DemoRole, ...DemoRole[]]);

/**
 * Signs the visitor in as a demo account.
 *
 * Mints a magic-link token with the service role (no email is sent) and
 * redeems it on this request, which writes the session cookies. A Server
 * Action may set cookies, so no callback round trip is needed. Signing in as
 * another role simply replaces the current session.
 */
export async function enterDemo(formData: FormData): Promise<void> {
  if (!demoAccessEnabled()) redirect('/demo');

  const parsed = roleSchema.safeParse(formData.get('role'));
  if (!parsed.success) redirect('/demo?error=role');
  const role = DEMO_ROLES[parsed.data];

  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: role.email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[demo] could not mint a sign-in token', { role: parsed.data, error: error?.message });
    redirect('/demo?error=unavailable');
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  if (verifyError) {
    console.error('[demo] could not redeem the sign-in token', { role: parsed.data, error: verifyError.message });
    redirect('/demo?error=unavailable');
  }

  redirect(role.landing);
}
