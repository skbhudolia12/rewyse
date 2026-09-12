/**
 * Verifies the Supabase project is reachable, the schema is applied, and RLS
 * actually denies anonymous reads.
 *
 *   npm run check:db
 *
 * Reports only presence and shape -- never prints a key value.
 *
 * Deliberately avoids `head: true` probes: PostgREST answers those with 204 and
 * no error even for a table that does not exist, which turns a missing schema
 * into a row of green PASSes. Every check here reads real rows or says why it
 * cannot.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_TABLES = [
  'clusters',
  'campuses',
  'campus_domains',
  'safe_meetup_points',
  'profiles',
  'id_verifications',
  'listings',
  'listing_media',
  'comparables',
  'price_cache',
  'pricing_events',
  'conversations',
  'messages',
  'offers',
  'meetup_proposals',
  'reports',
  'notifications',
];

/** SECURITY DEFINER helpers from 0002_functions.sql, exposed by PostgREST as RPC. */
const EXPECTED_FUNCTIONS = ['is_verified', 'is_admin', 'current_cluster_id', 'current_campus_id'];

const SEED_EXPECTATIONS = {
  clusters: 1,
  campuses: 3,
  campus_domains: 3,
  safe_meetup_points: 9,
  comparables: 10,
};

/** Private tables: a browser key with no session must read zero rows. */
const PRIVATE_TABLES = ['profiles', 'listings', 'messages', 'offers', 'id_verifications'];

const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const warn = (m) => console.log(`  \x1b[33m????\x1b[0m  ${m}`);
const bad = (m) => {
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
  process.exitCode = 1;
};

function loadEnv(path = '.env.local') {
  const env = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`\nNo ${path}. Copy .env.example to .env.local and fill it in.\n`);
    process.exit(1);
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\nReWyse database check\n');
console.log('Environment');
if (!url) {
  bad('NEXT_PUBLIC_SUPABASE_URL missing');
  process.exit(1);
}
ok(`project url ${url.replace(/https:\/\/([^.]{4})[^.]*/, 'https://$1***')}`);
publishable ? ok('publishable key present') : bad('publishable key missing');
serviceRole ? ok('service role key present') : bad('service role key missing');
if (!publishable || !serviceRole) {
  console.error('\nFill the missing keys in .env.local.\n');
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, publishable, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('\nConnectivity');
try {
  const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: publishable } });
  res.ok ? ok(`auth service reachable (${res.status})`) : bad(`auth service returned ${res.status}`);
} catch (err) {
  bad(`cannot reach project: ${err.message}`);
  console.error('\nCheck the URL, and that the project is not paused.\n');
  process.exit(1);
}

console.log('\nSchema');
const rowCounts = {};
const missing = [];
for (const table of EXPECTED_TABLES) {
  const { data, error } = await admin.from(table).select('*');
  if (error) {
    missing.push(table);
  } else {
    rowCounts[table] = data.length;
  }
}
if (missing.length === EXPECTED_TABLES.length) {
  bad(`no tables exist -- migrations have not been applied`);
} else if (missing.length) {
  bad(`missing ${missing.length}/${EXPECTED_TABLES.length}: ${missing.join(', ')}`);
} else {
  ok(`all ${EXPECTED_TABLES.length} tables present`);
}

console.log('\nFunctions and triggers (0002)');
if (missing.length === EXPECTED_TABLES.length) {
  warn('skipped -- no schema to check against');
} else {
  for (const fn of EXPECTED_FUNCTIONS) {
    const { error } = await admin.rpc(fn);
    // A missing function is PGRST202; anything else means it exists and ran.
    error?.code === 'PGRST202' ? bad(`${fn}() not found`) : ok(`${fn}() present`);
  }
}

console.log('\nSeed data');
for (const [table, want] of Object.entries(SEED_EXPECTATIONS)) {
  if (missing.includes(table)) {
    warn(`${table}: table missing`);
    continue;
  }
  const got = rowCounts[table] ?? 0;
  if (got === 0) bad(`${table}: empty (expected ${want}) -- run: npm run seed`);
  else if (got < want) warn(`${table}: ${got} rows (expected ${want})`);
  else ok(`${table}: ${got} rows`);
}

console.log('\nRLS enforcement (browser key, no session)');
for (const table of PRIVATE_TABLES) {
  if (missing.includes(table)) {
    warn(`${table}: table missing`);
    continue;
  }
  const total = rowCounts[table] ?? 0;
  const { data, error } = await anon.from(table).select('*').limit(1);
  const visible = data?.length ?? 0;
  if (visible > 0) {
    bad(`${table}: ANONYMOUS READ SUCCEEDED -- RLS is not protecting this table`);
  } else if (total === 0) {
    // An empty table returns [] whether RLS is on or off. Saying PASS here
    // would be the same false-confidence trap as the head-probe above.
    warn(`${table}: inconclusive -- table is empty, nothing to deny`);
  } else {
    ok(`${table}: ${total} rows exist, anonymous sees 0${error ? ' (denied)' : ''}`);
  }
}

if (!missing.includes('campuses')) {
  const { data } = await anon.from('campuses').select('*').limit(1);
  if ((rowCounts.campuses ?? 0) === 0) warn('campuses: inconclusive -- not seeded yet');
  else if ((data?.length ?? 0) > 0) ok('campuses: readable pre-auth, as signup requires');
  else bad('campuses: not readable anonymously -- the signup form will have no options');
}

console.log(
  process.exitCode
    ? '\nDatabase is NOT ready. Fix the FAIL lines above.\n'
    : '\nDatabase is up.\n',
);
