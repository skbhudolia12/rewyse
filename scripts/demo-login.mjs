/**
 * Prints a one-time sign-in link for a demo role.
 *
 *   npm run demo:login -- --as seller   -- Rohit Mehra, IIITD
 *   npm run demo:login -- --as buyer    -- Ananya Rao, IITD
 *   npm run demo:login -- --as ops      -- Kabir Sethi, ReWyse operations (admin)
 *
 * Run `npm run seed:demo` first; it creates these accounts. Open each link in
 * its own Chrome profile: a session is one cookie per browser profile, so three
 * profiles side by side give three signed-in panels that update live.
 *
 * Uses Supabase's admin generateLink, which mints a sign-in URL WITHOUT sending
 * mail, so it is unaffected by email rate limits. Development only.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ROLES = {
  seller: 'demo.seller@iiitd.ac.in',
  buyer: 'demo.buyer@iitd.ac.in',
  ops: 'demo.ops@iiitd.ac.in',
};

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
const role = args[args.indexOf('--as') + 1];
const email = ROLES[role];
if (!args.includes('--as') || !email) {
  console.error(`\n  Usage: npm run demo:login -- --as ${Object.keys(ROLES).join('|')}\n`);
  process.exit(1);
}

const env = loadEnv();
const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profile } = await admin.from('profiles').select('full_name').eq('email', email).maybeSingle();
if (!profile) {
  console.error(`\n  ${email} does not exist yet. Run \`npm run seed:demo\` first.\n`);
  process.exit(1);
}

const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: `${siteUrl}/auth/callback` },
});
if (error || !data?.properties) {
  console.error(`\n  Could not generate a link: ${error?.message ?? 'unknown error'}\n`);
  process.exit(1);
}

console.log(`\n  ${role}: ${profile.full_name} <${email}>\n`);
console.log(`  ${data.properties.action_link}\n`);
console.log('  Single use. Re-run for a fresh link.\n');
