/**
 * Seeds reference data for the Delhi cluster pilot.
 *
 *   npm run seed
 *
 * Idempotent: fixed UUIDs and upserts, so re-running never duplicates rows.
 * Uses the service role key because this data is admin-owned and RLS denies it
 * to everyone else by design.
 *
 * NOTE: meetup point names are placeholders chosen to be plausible campus
 * landmarks. Walk each campus and replace them with real, well-lit, staffed
 * locations before that campus goes live -- this list is a safety control, and
 * a student will actually go and stand where it says.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CLUSTER_ID = '11111111-1111-1111-1111-111111111111';
const IIITD = '22222222-2222-2222-2222-222222222201';
const IITD = '22222222-2222-2222-2222-222222222202';
const DTU = '22222222-2222-2222-2222-222222222203';

const clusters = [{ id: CLUSTER_ID, name: 'Delhi Cluster' }];

const campuses = [
  { id: IIITD, cluster_id: CLUSTER_ID, name: 'IIIT Delhi', abbreviation: 'IIITD' },
  { id: IITD, cluster_id: CLUSTER_ID, name: 'IIT Delhi', abbreviation: 'IITD' },
  { id: DTU, cluster_id: CLUSTER_ID, name: 'Delhi Technological University', abbreviation: 'DTU' },
];

const campusDomains = [
  { campus_id: IIITD, domain: 'iiitd.ac.in' },
  { campus_id: IITD, domain: 'iitd.ac.in' },
  { campus_id: DTU, domain: 'dtu.ac.in' },
];

const meetupPoints = [
  { campus_id: IIITD, name: 'Library Foyer' },
  { campus_id: IIITD, name: 'Academic Block Entrance' },
  { campus_id: IIITD, name: 'Main Gate Security Desk' },
  { campus_id: IITD, name: 'Central Library Steps' },
  { campus_id: IITD, name: 'Main Gate Security Desk' },
  { campus_id: IITD, name: 'Student Activity Centre' },
  { campus_id: DTU, name: 'Central Library Entrance' },
  { campus_id: DTU, name: 'Main Gate Security Desk' },
  { campus_id: DTU, name: 'Sports Complex Entrance' },
];

/**
 * Seed base values. These override the LLM whenever a listing title matches the
 * keyword, so this table is the mechanism for correcting the model on a specific
 * item's local resale value. Expand it during the pilot rather than tuning the
 * prompt for one-off mistakes.
 */
const comparables = [
  { category: 'furniture', keyword: 'study table', base_value: 2500 },
  { category: 'furniture', keyword: 'study chair', base_value: 1800 },
  { category: 'furniture', keyword: 'mattress', base_value: 2000 },
  { category: 'furniture', keyword: 'bookshelf', base_value: 1500 },
  { category: 'appliances', keyword: 'induction', base_value: 1200 },
  { category: 'appliances', keyword: 'kettle', base_value: 600 },
  { category: 'appliances', keyword: 'table fan', base_value: 900 },
  { category: 'appliances', keyword: 'mini fridge', base_value: 5500 },
  { category: 'electronics', keyword: 'monitor', base_value: 6000 },
  { category: 'electronics', keyword: 'mechanical keyboard', base_value: 2500 },
].map((row) => ({
  ...row,
  cluster_id: CLUSTER_ID,
  note: 'Seeded pre-launch, unverified',
}));

function loadEnv(path = '.env.local') {
  const env = {};
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsert(table, rows, onConflict) {
  const { error } = await admin.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) {
    console.error(`  FAIL  ${table}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ok    ${table}: ${rows.length} rows`);
}

console.log('\nSeeding Delhi cluster reference data\n');

await upsert('clusters', clusters, 'id');
await upsert('campuses', campuses, 'id');
await upsert('campus_domains', campusDomains, 'domain');

// No natural key on these two, so clear the cluster's rows and reinsert rather
// than accumulating duplicates on every run.
const campusIds = campuses.map((c) => c.id);
await admin.from('safe_meetup_points').delete().in('campus_id', campusIds);
await upsert('safe_meetup_points', meetupPoints);

await admin.from('comparables').delete().eq('cluster_id', CLUSTER_ID);
await upsert('comparables', comparables);

console.log(process.exitCode ? '\nSeed finished with errors.\n' : '\nSeed complete.\n');
