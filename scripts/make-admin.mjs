/**
 * Grants or revokes the admin role.
 *
 *   npm run make-admin -- someone@iiitd.ac.in
 *   npm run make-admin -- someone@iiitd.ac.in --revoke
 *
 * Admin is deliberately not self-serve: RLS forbids a student writing their own
 * `role`, so the only way in is here, with the service role key, by someone who
 * already has access to the project. Run it against your own account to reach
 * the ID review queue.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
const revoke = args.includes('--revoke');
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

if (!email) {
  console.error('\nUsage: npm run make-admin -- <email> [--revoke]\n');
  process.exit(1);
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profile, error: findError } = await admin
  .from('profiles')
  .select('id, full_name, role, verified_status')
  .eq('email', email)
  .maybeSingle();

if (findError) {
  console.error(`\nLookup failed: ${findError.message}\n`);
  process.exit(1);
}

if (!profile) {
  console.error(
    `\nNo profile for ${email}.` +
      '\nThey must finish signup first -- signing in alone does not create a profile.\n',
  );
  process.exit(1);
}

const role = revoke ? 'student' : 'admin';
const { error: updateError } = await admin
  .from('profiles')
  .update({ role })
  .eq('id', profile.id);

if (updateError) {
  console.error(`\nUpdate failed: ${updateError.message}\n`);
  process.exit(1);
}

console.log(`\n${profile.full_name} (${email}) is now: ${role}`);
if (!revoke && profile.verified_status !== 'verified') {
  console.log(
    'Note: this account is not verified yet, so the app still gates it. Approve their ID' +
      '\n      in the queue, or verify them directly, before expecting full access.',
  );
}
console.log('');
