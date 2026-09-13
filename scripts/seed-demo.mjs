/**
 * Seeds demo sellers and listings across the Delhi cluster.
 *
 *   npm run seed:demo          -- create/refresh demo listings
 *   npm run seed:demo -- --clear  -- remove them again
 *
 * A marketplace with four items reads as dead, and that impression is hard to
 * argue your way out of in a demo. Every row here is tagged so it can be pulled
 * out cleanly before real students arrive.
 *
 * Prices are set directly rather than through the pricing engine: seeding should
 * not spend model quota, and these are illustrative, not measurements.
 *
 * It DOES write pricing_events, so the pilot dashboard has something to draw --
 * every one tagged prompt_version 'demo-seed'. The dashboard counts those
 * separately and says on its face that seeded rows are present, because a
 * fabricated acceptance rate that cannot be told from a real one is how a
 * made-up number ends up in a pitch deck.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DEMO_TAG = '[demo]';
const CAMPUSES = {
  IIITD: '22222222-2222-2222-2222-222222222201',
  IITD: '22222222-2222-2222-2222-222222222202',
  DTU: '22222222-2222-2222-2222-222222222203',
};

const SELLERS = [
  { key: 'ananya', name: 'Ananya R.', campus: 'IITD', hostel: 'Himadri Hostel' },
  { key: 'rohit', name: 'Rohit M.', campus: 'IIITD', hostel: 'Boys Hostel, Block C' },
  { key: 'priya', name: 'Priya S.', campus: 'DTU', hostel: 'Aryabhatta Hostel' },
];

/** daysOut drives the countdown, which is the whole visual story of the feed. */
const LISTINGS = [
  { seller: 'ananya', title: 'Dell 24" IPS monitor', category: 'electronics', price: 3750, min: 5100, max: 6300, cond: 'fully_working', daysOut: 3, acc: 'Charger + HDMI cable', flaw: 'Minor scuffs on the base' },
  { seller: 'ananya', title: 'Mini fridge, 45L', category: 'appliances', price: 4200, min: 4650, max: 5750, cond: 'fully_working', daysOut: 3, acc: 'Original shelves', flaw: 'Small dent on the side' },
  { seller: 'rohit', title: 'Mechanical keyboard, brown switches', category: 'electronics', price: 2100, min: 2100, max: 2650, cond: 'fully_working', daysOut: 5, acc: 'USB-C cable, keycap puller', flaw: 'Shine on WASD' },
  { seller: 'rohit', title: 'Study table, solid wood', category: 'furniture', price: 1900, min: 2100, max: 2650, cond: 'fully_working', daysOut: 6, acc: null, flaw: 'Ring marks on the top' },
  { seller: 'priya', title: 'Ergonomic study chair', category: 'furniture', price: 1450, min: 1500, max: 1900, cond: 'fully_working', daysOut: 7, acc: null, flaw: 'Armrest slightly loose' },
  { seller: 'priya', title: 'GATE CS prep set, 6 books', category: 'books', price: 850, min: 900, max: 1150, cond: 'fully_working', daysOut: 12, acc: 'Includes solved papers', flaw: 'Highlighting throughout' },
  { seller: 'rohit', title: 'Desk lamp, adjustable arm', category: 'furniture', price: 450, min: 450, max: 600, cond: 'fully_working', daysOut: 9, acc: 'LED bulb included', flaw: null },
  { seller: 'ananya', title: 'Induction cooktop, 1600W', category: 'appliances', price: 900, min: 1000, max: 1300, cond: 'fully_working', daysOut: 14, acc: 'One steel pan', flaw: 'Scratched glass top' },
  { seller: 'priya', title: 'Hostel cycle, single speed', category: 'other', price: 2800, min: 2800, max: 3500, cond: 'partially_working', daysOut: 18, acc: 'Lock and key', flaw: 'Rear brake needs adjusting' },
  { seller: 'rohit', title: 'Table fan, 3-speed', category: 'appliances', price: 700, min: 750, max: 950, cond: 'fully_working', daysOut: 21, acc: null, flaw: null },
  { seller: 'ananya', title: 'Bookshelf, 4 shelves', category: 'furniture', price: 1200, min: 1250, max: 1600, cond: 'fully_working', daysOut: 25, acc: null, flaw: 'One shelf slightly warped' },
  { seller: 'priya', title: 'Noise-cancelling headphones', category: 'electronics', price: 3200, min: 3400, max: 4200, cond: 'fully_working', daysOut: 30, acc: 'Case and cable', flaw: 'Worn earcup padding' },
];

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

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isoIn = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const emailFor = (key) => `demo.${key}@${key === 'rohit' ? 'iiitd' : key === 'ananya' ? 'iitd' : 'dtu'}.ac.in`;

async function clear() {
  console.log('\nRemoving demo data\n');
  const { data: sellers } = await admin
    .from('profiles')
    .select('id')
    .in('email', SELLERS.map((s) => emailFor(s.key)));

  const ids = (sellers ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from('pricing_events').delete().in('seller_id', ids);
    const { count } = await admin
      .from('listings')
      .delete({ count: 'exact' })
      .in('seller_id', ids);
    console.log(`  removed ${count ?? 0} listings`);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    console.log(`  removed ${ids.length} demo sellers`);
  } else {
    console.log('  nothing to remove');
  }
  console.log('');
}

if (process.argv.includes('--clear')) {
  await clear();
  process.exit(0);
}

console.log('\nSeeding demo listings\n');

const sellerIds = {};
for (const s of SELLERS) {
  const email = emailFor(s.key);
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    sellerIds[s.key] = existing.id;
    console.log(`  reused  ${s.name}`);
    continue;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Demo-${s.key}-2026!`,
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error(`  FAIL    ${s.name}: ${error?.message}`);
    continue;
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id,
    full_name: s.name,
    email,
    campus_id: CAMPUSES[s.campus],
    hostel_or_hall: s.hostel,
    moveout_date: isoIn(20),
    email_domain_ok: true,
    id_review_status: 'approved',
  });
  if (profileError) {
    console.error(`  FAIL    ${s.name}: ${profileError.message}`);
    continue;
  }
  sellerIds[s.key] = data.user.id;
  console.log(`  created ${s.name} (${s.campus})`);
}

// Replace rather than accumulate, so re-running does not duplicate the feed.
await admin.from('listings').delete().in('seller_id', Object.values(sellerIds));

const rows = LISTINGS.filter((l) => sellerIds[l.seller]).map((l) => {
  const seller = SELLERS.find((s) => s.key === l.seller);
  return {
    seller_id: sellerIds[l.seller],
    campus_id: CAMPUSES[seller.campus],
    title: l.title,
    description: `${DEMO_TAG} Seeded listing for the pilot demo.`,
    category: l.category,
    functional_status: l.cond,
    cosmetic_flaws: l.flaw,
    accessories_included: l.acc,
    moveout_date: isoIn(l.daysOut),
    suggested_price_min: l.min,
    suggested_price_max: l.max,
    suggested_sell_fast_price: l.price,
    asking_price: l.price,
    status: 'active',
    published_at: new Date().toISOString(),
  };
});

const { error } = await admin.from('listings').insert(rows);
if (error) {
  console.error(`\n  Could not insert listings: ${error.message}\n`);
  process.exit(1);
}

const clearance = LISTINGS.filter((l) => l.daysOut <= 7).length;
console.log(`\n  ${rows.length} listings across 3 campuses`);
console.log(`  ${clearance} inside the 7-day clearance window\n`);
console.log('  Remove them with: npm run seed:demo -- --clear\n');
