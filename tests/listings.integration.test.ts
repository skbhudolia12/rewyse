/**
 * Listing ownership and the pilot's aggregation.
 *
 *   npm run test:integration
 *
 * The ownership assertions matter most: a listing is a claim about a physical
 * item and a price, and a student editing someone else's would be able to
 * change what a buyer thinks they are paying for.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Seeding must not spend model quota; the fallback chain is tested elsewhere.
vi.mock('@/lib/pricing/llm', () => ({
  estimateBaseValue: vi.fn(async () => null),
}));

function loadEnv(file = '.env.local'): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY!;
const IIITD = '22222222-2222-2222-2222-222222222201';
const RUN = `lst${Date.now().toString(36)}`;

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestUser {
  id: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];

async function makeUser(label: string): Promise<TestUser> {
  const email = `${RUN}-${label}@example.test`;
  const password = `${RUN}-Passw0rd!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  createdUserIds.push(data.user.id);

  await admin.from('profiles').insert({
    id: data.user.id,
    full_name: `Listing ${label}`,
    email,
    campus_id: IIITD,
    moveout_date: '2027-06-30',
    email_domain_ok: true,
    id_review_status: 'approved',
  });

  const client = createClient(URL_, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client };
}

let owner: TestUser;
let other: TestUser;
let listingId: string;

beforeAll(async () => {
  [owner, other] = await Promise.all([makeUser('owner'), makeUser('other')]);

  const { data, error } = await admin
    .from('listings')
    .insert({
      seller_id: owner.id,
      campus_id: IIITD,
      title: `${RUN} desk lamp`,
      category: 'furniture',
      functional_status: 'fully_working',
      moveout_date: '2027-06-30',
      asking_price: 900,
      suggested_price_min: 800,
      suggested_price_max: 1000,
      suggested_sell_fast_price: 700,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed listing: ${error.message}`);
  listingId = data.id;
}, 60_000);

afterAll(async () => {
  await admin.from('pricing_events').delete().eq('seller_id', owner.id);
  await admin.from('listings').delete().eq('id', listingId);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe('listing ownership', () => {
  it('lets the owner change their own price', async () => {
    const { error } = await owner.client
      .from('listings')
      .update({ asking_price: 850 })
      .eq('id', listingId);
    expect(error).toBeNull();

    const { data } = await admin.from('listings').select('asking_price').eq('id', listingId).single();
    expect(data?.asking_price).toBe(850);
  });

  it('refuses another student editing the price', async () => {
    await other.client.from('listings').update({ asking_price: 1 }).eq('id', listingId);
    const { data } = await admin.from('listings').select('asking_price').eq('id', listingId).single();
    expect(data?.asking_price).not.toBe(1);
  });

  it('refuses another student changing the title', async () => {
    await other.client.from('listings').update({ title: 'hijacked' }).eq('id', listingId);
    const { data } = await admin.from('listings').select('title').eq('id', listingId).single();
    expect(data?.title).toContain(RUN);
  });

  it('refuses another student taking it off the market', async () => {
    await other.client.from('listings').update({ status: 'removed' }).eq('id', listingId);
    const { data } = await admin.from('listings').select('status').eq('id', listingId).single();
    expect(data?.status).toBe('active');
  });

  it('lets the owner remove it, which soft-removes rather than deletes', async () => {
    const { error } = await owner.client
      .from('listings')
      .update({ status: 'removed' })
      .eq('id', listingId);
    expect(error).toBeNull();

    // The row survives because its pricing_events and offers are measurements.
    const { data } = await admin.from('listings').select('id, status').eq('id', listingId).single();
    expect(data?.status).toBe('removed');
    expect(data?.id).toBe(listingId);

    await admin.from('listings').update({ status: 'active' }).eq('id', listingId);
  });
});

describe('repricing', () => {
  it('logs a separate, flagged event so it can be told apart from a first listing', async () => {
    const { getQuote } = await import('@/lib/pricing/service');

    await getQuote({
      title: `${RUN} desk lamp`,
      category: 'furniture',
      functionalStatus: 'fully_working',
      moveoutDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      sellerId: owner.id,
      listingId,
      isRepricing: true,
    });

    const { data } = await admin
      .from('pricing_events')
      .select('is_repricing, listing_id, days_until_moveout')
      .eq('seller_id', owner.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(data?.is_repricing).toBe(true);
    expect(data?.listing_id).toBe(listingId);
    expect(data?.days_until_moveout).toBe(2);
  });

  it('quotes lower as the deadline approaches, which is the point of repricing', async () => {
    const { getQuote } = await import('@/lib/pricing/service');
    const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

    const far = await getQuote({
      title: `${RUN} desk lamp`,
      category: 'furniture',
      functionalStatus: 'fully_working',
      moveoutDate: iso(20),
      sellerId: owner.id,
      listingId,
      isRepricing: true,
    });
    const near = await getQuote({
      title: `${RUN} desk lamp`,
      category: 'furniture',
      functionalStatus: 'fully_working',
      moveoutDate: iso(1),
      sellerId: owner.id,
      listingId,
      isRepricing: true,
    });

    expect(near.sellFastPrice).toBeLessThan(far.sellFastPrice);
  });
});

describe('pilot aggregation', () => {
  it('returns a coherent shape and never divides by zero', async () => {
    const { getInsights } = await import('@/lib/admin/insights');
    const insights = await getInsights();

    expect(insights.acceptanceRate).toBeGreaterThanOrEqual(0);
    expect(insights.acceptanceRate).toBeLessThanOrEqual(1);
    expect(insights.outcomes).toHaveLength(4);
    expect(insights.byDays).toHaveLength(5);

    // Shares are computed over decided events only, so they sum to 1 (or to 0
    // when nothing has been decided yet).
    const totalShare = insights.outcomes.reduce((s, o) => s + o.share, 0);
    expect(insights.decided === 0 ? totalShare : Math.round(totalShare)).toBe(
      insights.decided === 0 ? 0 : 1,
    );

    const counted = insights.outcomes.reduce((s, o) => s + o.count, 0);
    expect(counted).toBe(insights.decided);
  });
});
