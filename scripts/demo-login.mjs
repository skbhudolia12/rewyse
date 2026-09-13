/**
 * Creates (or reuses) a fully-verified demo account and prints a sign-in link.
 *
 *   npm run demo:login                      -- default demo student
 *   npm run demo:login -- you@iiitd.ac.in   -- a specific address
 *   npm run demo:login -- --admin           -- demo account with admin rights
 *
 * Uses Supabase's admin generateLink, which mints a valid sign-in URL WITHOUT
 * sending mail. That sidesteps the built-in 2-emails-per-hour cap, so the app
 * is walkable before custom SMTP is configured.
 *
 * Development only. It bypasses both signup gates by design, which is exactly
 * why it must never run against a project real students are using.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_EMAIL = 'demo@iiitd.ac.in';
const IIITD = '22222222-2222-2222-2222-222222222201';

function loadEnv(file = '.env.local') {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const args = process.argv.slice(2);
const wantAdmin = args.includes('--admin');
const email = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_EMAIL).toLowerCase();

const env = loadEnv();
const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('\nDemo sign-in\n');

// Reuse the account if it exists; generateLink creates one otherwise.
const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();

const { data: link, error: linkError } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: `${siteUrl}/auth/callback` },
});

if (linkError || !link?.properties) {
  console.error(`  Could not generate a link: ${linkError?.message ?? 'unknown error'}\n`);
  process.exit(1);
}

const userId = link.user?.id;
if (!userId) {
  console.error('  No user id returned.\n');
  process.exit(1);
}

const moveout = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);

if (!existing) {
  const { error } = await admin.from('profiles').insert({
    id: userId,
    full_name: wantAdmin ? 'Demo Admin' : 'Demo Student',
    email,
    campus_id: IIITD,
    hostel_or_hall: 'Demo Block A',
    // Six days out, so the clearance banner and urgency pricing are visible
    // immediately rather than needing the date changed by hand.
    moveout_date: moveout,
    email_domain_ok: true,
    id_review_status: 'approved',
    ...(wantAdmin ? { role: 'admin' } : {}),
  });
  if (error) {
    console.error(`  Could not create the profile: ${error.message}\n`);
    process.exit(1);
  }
  console.log(`  created  ${email}${wantAdmin ? ' (admin)' : ''}`);
} else {
  const patch = { email_domain_ok: true, id_review_status: 'approved', moveout_date: moveout };
  if (wantAdmin) patch.role = 'admin';
  await admin.from('profiles').update(patch).eq('id', userId);
  console.log(`  reused   ${email}${wantAdmin ? ' (admin)' : ''}`);
}

// generateLink returns the Supabase verify URL; following it lands on our
// callback, which routes by how far through onboarding the account is.
console.log(`  verified, moving out ${moveout}\n`);
console.log('  Open this link to sign in:\n');
console.log(`  ${link.properties.action_link}\n`);
console.log('  The link is single-use. Re-run this command for a fresh one.\n');
