/**
 * Seeds the demo: people, a full feed, boosts, finished orders, and the frozen
 * AI answers for the items listed on camera.
 *
 *   npm run eval:pricing          -- first: produces demo-assets/model-answers.json
 *   npm run seed:demo             -- wipe demo data, then seed it fresh (run before every take)
 *   npm run seed:demo -- --clear  -- wipe demo data only
 *
 * Product photos are read from demo-assets/listings/<slug>.jpg (or .png/.webp),
 * and an optional verification video from demo-assets/listings/<slug>.mp4.
 * A listing whose photo is missing is still created, and the script lists it,
 * so a gap is visible before recording rather than on camera.
 *
 * Orders are walked through the real flow, each step signed in as the person
 * who takes it (buyer pays, operations advances delivery, buyer confirms,
 * operations pays out), so every database rule the app relies on is exercised.
 *
 * Demo data is identified by its accounts (demo.*@ addresses), never by text in
 * the listings, so nothing on screen reads as test data.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CAMPUSES = {
  IIITD: '22222222-2222-2222-2222-222222222201',
  IITD: '22222222-2222-2222-2222-222222222202',
  DTU: '22222222-2222-2222-2222-222222222203',
};
const DOMAINS = { IIITD: 'iiitd.ac.in', IITD: 'iitd.ac.in', DTU: 'dtu.ac.in' };

/** The three faces of the demo, plus the students whose items fill the feed. */
const PEOPLE = [
  { key: 'seller', name: 'Rohit Mehra', campus: 'IIITD', hostel: 'Boys Hostel, Block C', moveoutIn: 5 },
  { key: 'buyer', name: 'Ananya Rao', campus: 'IITD', hostel: 'Himadri Hostel', moveoutIn: 120 },
  { key: 'ops', name: 'Kabir Sethi', campus: 'IIITD', hostel: null, moveoutIn: 365, role: 'admin' },
  { key: 'priya', name: 'Priya Sharma', campus: 'DTU', hostel: 'Aryabhatta Hostel', moveoutIn: 3 },
  { key: 'arjun', name: 'Arjun Nair', campus: 'IITD', hostel: 'Kumaon Hostel', moveoutIn: 9 },
  { key: 'meera', name: 'Meera Iyer', campus: 'IIITD', hostel: 'Girls Hostel, Block A', moveoutIn: 6 },
  { key: 'vikram', name: 'Vikram Singh', campus: 'DTU', hostel: 'Ramanujan Hostel', moveoutIn: 18 },
  { key: 'sneha', name: 'Sneha Gupta', campus: 'IITD', hostel: 'Kailash Hostel', moveoutIn: 25 },
];

const emailFor = (p) => `demo.${p.key}@${DOMAINS[p.campus]}`;
const passwordFor = (p) => `Demo-${p.key}-ReWyse-2026!`;

/**
 * The feed. Slugs match tests/eval/golden-items.ts, whose reviewed model
 * answers supply each item's value and its "How this price was set" note.
 * `ask` is what the seller chose: the quick-sale price, the fair price, or a
 * markup over the fair price.
 */
const CATALOGUE = [
  { slug: 'samsung-monitor', seller: 'arjun', daysOut: 9, ask: 'sell_fast', desc: 'Used for a year as a second screen. No dead pixels.' },
  { slug: 'kindle', seller: 'sneha', daysOut: 25, ask: 'fair_min', desc: 'Battery still lasts weeks. Comes with a cover.' },
  { slug: 'sony-xm4', seller: 'vikram', daysOut: 18, ask: 'fair_min', desc: 'Noise cancelling works perfectly. Original box included.' },
  { slug: 'hp-laptop', seller: 'priya', daysOut: 3, ask: 'sell_fast', desc: 'Battery holds about 4 hours. Freshly reset, charger included.' },
  { slug: 'jbl-speaker', seller: 'meera', daysOut: 6, ask: 'sell_fast', desc: 'Loud and waterproof. Great for hostel rooms.' },
  { slug: 'mx-master', seller: 'arjun', daysOut: 9, ask: 'fair_min', desc: 'Works on three devices. Charges over USB-C.' },
  { slug: 'k380', seller: 'seller', daysOut: 5, ask: 'sell_fast', desc: 'Quiet keys, pairs with laptop and phone.' },
  { slug: 'power-bank', seller: 'sneha', daysOut: 25, ask: 'fair_min', desc: 'Charges a phone four times. No swelling.' },
  { slug: 'boat-headphones', seller: 'vikram', daysOut: 18, ask: 'sell_fast', desc: 'Both sides work. Cushions recently replaced.' },
  { slug: 'casio-calculator', seller: 'priya', daysOut: 3, ask: 'sell_fast', desc: 'Exam-approved model. Fresh battery.' },
  { slug: 'induction', seller: 'meera', daysOut: 6, ask: 'sell_fast', desc: 'All touch buttons work. One pan included.' },
  { slug: 'kettle', seller: 'vikram', daysOut: 18, ask: 'fair_min', desc: 'Boils in two minutes. Descaled last week.' },
  { slug: 'table-fan', seller: 'sneha', daysOut: 25, ask: 'fair_min', desc: 'All three speeds work. Oscillation works.' },
  { slug: 'heater', seller: 'priya', daysOut: 3, ask: 'sell_fast', desc: 'Two heat settings. Bought last winter.' },
  { slug: 'steam-iron', seller: 'arjun', daysOut: 9, ask: 'sell_fast', desc: 'Steam and dry modes both work.' },
  { slug: 'bookshelf', seller: 'seller', daysOut: 5, ask: 'fair_min', desc: 'Sturdy, easy to carry with two people.' },
  { slug: 'gate-books', seller: 'arjun', daysOut: 9, ask: 'fair_min', desc: 'Notes in pencil only. All six volumes.' },
  { slug: 'clrs', seller: 'meera', daysOut: 6, ask: 'sell_fast', desc: 'Light highlighting in the first chapters.' },
  { slug: 'cycle', seller: 'sneha', daysOut: 25, ask: 'fair_min', desc: 'Brakes adjusted last month. Rides smoothly.' },
  { slug: 'badminton', seller: 'arjun', daysOut: 9, ask: 'sell_fast', desc: 'Strung recently. Cover included.' },
  { slug: 'football', seller: 'meera', daysOut: 6, ask: 'sell_fast', desc: 'Holds air well. Used on turf only.' },
  { slug: 'wooden-stool', seller: 'meera', daysOut: 6, ask: 'sell_fast', desc: 'Doubles as a bedside table. Very sturdy.' },
  { slug: 'bedside-table', seller: 'priya', daysOut: 3, ask: 'sell_fast', desc: 'Drawer and cupboard both close properly.' },
  { slug: 'desk-lamp', seller: 'vikram', daysOut: 18, ask: 'fair_min', desc: 'Warm light, good for late-night reading.' },
  { slug: 'whiteboard', seller: 'arjun', daysOut: 9, ask: 'fair_min', desc: 'Wipes clean. Wall hooks included.' },
  { slug: 'backpack', seller: 'vikram', daysOut: 18, ask: 'fair_min', desc: 'Rain cover included. No tears.' },
];

/** Listings boosted by their sellers, so the feed shows Sponsored items. */
const BOOSTED = [
  { slug: 'sony-xm4', plan: 'boost_7d' },
  { slug: 'kindle', plan: 'boost_7d' },
  { slug: 'cycle', plan: 'boost_3d' },
];

/** Orders that already happened, so operations has revenue and history to show. */
const ORDERS = [
  { slug: 'power-bank', buyer: 'arjun', stage: 'completed' },
  { slug: 'kettle', buyer: 'priya', stage: 'completed' },
  { slug: 'gate-books', buyer: 'meera', stage: 'completed' },
  { slug: 'table-fan', buyer: 'vikram', stage: 'picked_up' },
];

// ---------------------------------------------------------------- pricing (mirrors src/lib/pricing/rails.ts)

const CONDITION = { fully_working: 1.0, partially_working: 0.6, for_parts: 0.3 };
const WINDOW = 21;
const DECAY = 7;
const STEP = 50;

const round50 = (v) => Math.max(STEP, Math.round(v / STEP) * STEP);
function urgency(days) {
  if (days >= WINDOW) return 1;
  const shape = (d) => 1 - Math.exp(-Math.max(0, d) / DECAY);
  return 0.6 + 0.4 * (shape(days) / shape(WINDOW));
}
function suggest(base, cond, days) {
  const adjusted = base * CONDITION[cond];
  const fairMin = round50(adjusted * 0.85);
  const fairMax = Math.max(round50(adjusted * 1.05), fairMin + STEP);
  const sellFast = Math.min(round50(adjusted * 0.85 * urgency(days)), fairMin);
  return { fairMin, fairMax, sellFast, factor: urgency(days), mult: CONDITION[cond] };
}
function outcome(ask, s) {
  if (ask === s.sellFast) return 'accepted_sell_fast';
  if (ask > s.fairMax) return 'above_range';
  if (ask >= s.fairMin) return 'within_range';
  return 'below_range';
}

// ---------------------------------------------------------------- setup

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
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isoIn = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const fail = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

async function sessionFor(person) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: emailFor(person),
    password: passwordFor(person),
  });
  if (error) fail(`Could not sign in as ${person.name}: ${error.message}`);
  return client;
}

/** Throws with the step name, so a broken rule is reported where it broke. */
async function must(step, promise) {
  const { data, error } = await promise;
  if (error) fail(`${step}: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------- clear

async function clear() {
  console.log('\nRemoving demo data');
  const { data: profiles } = await service
    .from('profiles')
    .select('id')
    .in('email', PEOPLE.map(emailFor));
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) {
    console.log('  nothing to remove');
    return;
  }

  // Payments and boosts cascade from listings; pricing events do not.
  await service.from('pricing_events').delete().in('seller_id', ids);
  await service.from('payments').delete().in('buyer_id', ids);
  const { count } = await service.from('listings').delete({ count: 'exact' }).in('seller_id', ids);
  for (const id of ids) {
    const { data: files } = await service.storage.from('listing-media').list(id);
    if (files?.length) {
      await service.storage.from('listing-media').remove(files.map((f) => `${id}/${f.name}`));
    }
    await service.auth.admin.deleteUser(id);
  }
  console.log(`  removed ${count ?? 0} listings and ${ids.length} accounts`);
}

// ---------------------------------------------------------------- seed

function loadAnswers() {
  const path = 'demo-assets/model-answers.json';
  if (!existsSync(path)) fail('demo-assets/model-answers.json is missing. Run `npm run eval:pricing` first.');
  const answers = JSON.parse(readFileSync(path, 'utf8'));
  return new Map(answers.map((a) => [a.slug, a]));
}

function mediaFor(slug) {
  const photo = ['jpg', 'jpeg', 'png', 'webp']
    .map((ext) => `demo-assets/listings/${slug}.${ext}`)
    .find((p) => existsSync(p));
  const video = existsSync(`demo-assets/listings/${slug}.mp4`) ? `demo-assets/listings/${slug}.mp4` : null;
  return { photo, video };
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };

async function ensurePeople() {
  console.log('\nAccounts');
  const ids = {};
  for (const p of PEOPLE) {
    const email = emailFor(p);
    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password: passwordFor(p),
      email_confirm: true,
    });
    if (error) fail(`Could not create ${p.name}: ${error.message}`);
    ids[p.key] = created.user.id;

    await must(
      `profile for ${p.name}`,
      service.from('profiles').insert({
        id: created.user.id,
        full_name: p.name,
        email,
        campus_id: CAMPUSES[p.campus],
        hostel_or_hall: p.hostel,
        moveout_date: isoIn(p.moveoutIn),
        email_domain_ok: true,
        id_review_status: 'approved',
        ...(p.role ? { role: p.role } : {}),
      }),
    );
    console.log(`  ${p.key.padEnd(7)} ${p.name} (${p.campus})  ${email}`);
  }
  return ids;
}

async function seedListings(ids, answers) {
  console.log('\nListings');
  const missingPhotos = [];
  const listingIds = {};

  for (const item of CATALOGUE) {
    const answer = answers.get(item.slug);
    if (!answer) fail(`No reviewed model answer for "${item.slug}". Re-run \`npm run eval:pricing\`.`);
    const seller = PEOPLE.find((p) => p.key === item.seller);
    const fields = answer.fields;
    const s = suggest(answer.base_value, 'fully_working', item.daysOut);
    const ask = item.ask === 'sell_fast' ? s.sellFast : s.fairMin;
    const { points } = JSON.parse(answer.reasoning);

    const listing = await must(
      `listing ${item.slug}`,
      service
        .from('listings')
        .insert({
          seller_id: ids[item.seller],
          campus_id: CAMPUSES[seller.campus],
          title: fields.title,
          description: item.desc,
          category: fields.category,
          functional_status: 'fully_working',
          cosmetic_flaws: fields.cosmeticFlaws || null,
          accessories_included: fields.accessories || null,
          moveout_date: isoIn(item.daysOut),
          suggested_price_min: s.fairMin,
          suggested_price_max: s.fairMax,
          suggested_sell_fast_price: s.sellFast,
          price_reasoning: points,
          asking_price: ask,
          status: 'active',
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single(),
    );
    listingIds[item.slug] = listing.id;

    // Feeds the pricing-insights page; tagged so it is counted apart from real sellers.
    await service.from('pricing_events').insert({
      listing_id: listing.id,
      seller_id: ids[item.seller],
      category: fields.category,
      title_snapshot: fields.title,
      base_value: answer.base_value,
      base_value_source: 'llm',
      condition_multiplier: s.mult,
      days_until_moveout: item.daysOut,
      urgency_factor: Number(s.factor.toFixed(3)),
      fair_min: s.fairMin,
      fair_max: s.fairMax,
      sell_fast_price: s.sellFast,
      model_used: answer.model_used,
      prompt_version: 'demo-seed',
      final_asking_price: ask,
      outcome: outcome(ask, s),
    });

    const { photo, video } = mediaFor(item.slug);
    if (!photo) missingPhotos.push(item.slug);
    const media = [photo, video].filter(Boolean);
    for (const [position, file] of media.entries()) {
      const ext = file.split('.').pop().toLowerCase();
      const path = `${ids[item.seller]}/seed-${item.slug}.${ext}`;
      await must(
        `upload ${file}`,
        service.storage
          .from('listing-media')
          .upload(path, readFileSync(file), { contentType: MIME[ext], upsert: true }),
      );
      await must(
        `media row ${item.slug}`,
        service.from('listing_media').insert({
          listing_id: listing.id,
          kind: ext === 'mp4' ? 'video' : 'photo',
          storage_path: path,
          // Seeded images were not taken in the app; the badge must not claim they were.
          is_live_capture: false,
          position,
        }),
      );
    }
  }

  console.log(`  ${CATALOGUE.length} listings across IIITD, IITD and DTU`);
  console.log(`  ${CATALOGUE.filter((c) => c.daysOut <= 7).length} inside the 7-day clearance window`);
  return { listingIds, missingPhotos };
}

async function freezeDemoAnswers(answers) {
  console.log('\nFrozen AI answers for the on-camera items');
  const demo = [...answers.values()].filter((a) => a.demo);
  for (const a of demo) {
    await must(
      `price_cache ${a.slug}`,
      service.from('price_cache').upsert(
        {
          cache_key: a.cache_key,
          base_value: a.base_value,
          source: 'llm',
          model_used: a.model_used,
          reasoning: a.reasoning,
          confidence: a.confidence,
          last_hit_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' },
      ),
    );
    console.log(`  ${a.slug.padEnd(14)} type exactly: "${a.fields.title}"`);
  }
}

async function seedBoosts(listingIds, sessions) {
  for (const b of BOOSTED) {
    const item = CATALOGUE.find((c) => c.slug === b.slug);
    const client = sessions[item.seller];
    const { data: { user } } = await client.auth.getUser();
    await must(
      `boost ${b.slug}`,
      client.from('boosts').insert({ listing_id: listingIds[b.slug], seller_id: user.id, plan: b.plan }),
    );
  }
  console.log(`\nBoosts: ${BOOSTED.length} listings featured`);
}

async function seedOrders(ids, listingIds, sessions) {
  console.log('\nOrders (walked through the real flow)');
  const ops = sessions.ops;

  for (const o of ORDERS) {
    const buyer = sessions[o.buyer];
    const item = CATALOGUE.find((c) => c.slug === o.slug);
    const order = await must(
      `order ${o.slug}`,
      buyer
        .from('payments')
        .insert({ listing_id: listingIds[o.slug], buyer_id: ids[o.buyer], seller_id: ids[item.seller] })
        .select('id')
        .single(),
    );
    const hostel = PEOPLE.find((p) => p.key === o.buyer).hostel;
    await must(
      `pay ${o.slug}`,
      buyer
        .from('payments')
        .update({ delivery_address: `${hostel}, Room 1${Math.floor(Math.random() * 90 + 10)}`, payment_method: 'UPI', status: 'held' })
        .eq('id', order.id),
    );

    const steps = o.stage === 'completed' ? ['picked_up', 'out_for_delivery', 'delivered'] : ['picked_up'];
    for (const step of steps) {
      await must(`${step} ${o.slug}`, ops.from('payments').update({ delivery_status: step }).eq('id', order.id));
    }

    if (o.stage === 'completed') {
      await must(
        `confirm ${o.slug}`,
        buyer.from('payments').update({ buyer_confirmed_at: new Date().toISOString() }).eq('id', order.id),
      );
      await must(
        `payout ${o.slug}`,
        ops
          .from('payments')
          .update({ status: 'released', released_by: ids.ops, released_at: new Date().toISOString() })
          .eq('id', order.id),
      );
    }
    console.log(`  ${o.slug.padEnd(14)} ${o.stage}`);
  }
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
if (args.includes('--clear')) {
  await clear();
  console.log('');
  process.exit(0);
}

const answers = loadAnswers();
await clear();
const ids = await ensurePeople();

const sessions = {};
for (const p of PEOPLE) sessions[p.key] = await sessionFor(p);

const { listingIds, missingPhotos } = await seedListings(ids, answers);
await freezeDemoAnswers(answers);
await seedBoosts(listingIds, sessions);
await seedOrders(ids, listingIds, sessions);

if (missingPhotos.length) {
  console.log(`\n  MISSING PHOTOS (${missingPhotos.length}). Add demo-assets/listings/<slug>.jpg for:`);
  console.log(`  ${missingPhotos.join(', ')}`);
}

console.log('\nSign in as each role with: npm run demo:login -- --as seller|buyer|ops\n');
