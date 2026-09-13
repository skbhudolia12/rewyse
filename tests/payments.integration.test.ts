/**
 * Payment state machine against the real database.
 *
 *   npm run test:integration
 *
 * The simulation moves no money, but the authorisation rules are real and will
 * carry over unchanged when a licensed provider replaces the stub. The question
 * these tests answer is the one that matters either way: can a buyer take money
 * out of hold by themselves? RLS says who may touch a payment row;
 * guard_payment_transition says what they may turn it into, and that trigger is
 * what is under test here.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY!;
const IIITD = '22222222-2222-2222-2222-222222222201';
const RUN = `pay${Date.now().toString(36)}`;

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestUser {
  id: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];

async function makeUser(label: string, opts: { role?: 'admin' } = {}): Promise<TestUser> {
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
    full_name: `Pay ${label}`,
    email,
    campus_id: IIITD,
    moveout_date: '2027-06-30',
    email_domain_ok: true,
    id_review_status: 'approved',
    ...(opts.role ? { role: opts.role } : {}),
  });

  const client = createClient(URL_, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client };
}

let buyer: TestUser;
let seller: TestUser;
let stranger: TestUser;
let reviewer: TestUser;
let listingId: string;

async function freshHeldPayment(): Promise<string> {
  const { data, error } = await admin
    .from('payments')
    .insert({
      listing_id: listingId,
      buyer_id: buyer.id,
      seller_id: seller.id,
      amount: 4200,
      status: 'held',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed payment: ${error.message}`);
  return data.id;
}

async function clearPayments() {
  await admin.from('payments').delete().eq('listing_id', listingId);
}

// Runs even when a test throws, so one failure cannot cascade into the rest via
// the one-active-payment-per-listing index.
afterEach(clearPayments);

beforeAll(async () => {
  [buyer, seller, stranger, reviewer] = await Promise.all([
    makeUser('buyer'),
    makeUser('seller'),
    makeUser('stranger'),
    makeUser('admin', { role: 'admin' }),
  ]);

  const { data, error } = await admin
    .from('listings')
    .insert({
      seller_id: seller.id,
      campus_id: IIITD,
      title: `${RUN} mini fridge`,
      category: 'appliances',
      functional_status: 'fully_working',
      moveout_date: '2027-06-30',
      asking_price: 4200,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed listing: ${error.message}`);
  listingId = data.id;
}, 60_000);

afterAll(async () => {
  await admin.from('payments').delete().eq('listing_id', listingId);
  await admin.from('listings').delete().eq('id', listingId);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe('privacy', () => {
  it('keeps a payment invisible to anyone who is not a party to it', async () => {
    const id = await freshHeldPayment();
    const { data } = await stranger.client.from('payments').select('id').eq('id', id);
    expect(data ?? []).toHaveLength(0);
  });

  it('lets both the buyer and the seller see their own payment', async () => {
    const id = await freshHeldPayment();
    const asBuyer = await buyer.client.from('payments').select('id').eq('id', id);
    const asSeller = await seller.client.from('payments').select('id').eq('id', id);
    expect(asBuyer.data ?? []).toHaveLength(1);
    expect(asSeller.data ?? []).toHaveLength(1);
  });
});

describe('release authority', () => {
  it('refuses to let a buyer release their own payment', async () => {
    const id = await freshHeldPayment();
    await buyer.client
      .from('payments')
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq('id', id);

    const { error } = await buyer.client
      .from('payments')
      .update({ status: 'released' })
      .eq('id', id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('payments').select('status').eq('id', id).single();
    expect(data?.status).toBe('held');
  });

  it('refuses to let a seller release money to themselves', async () => {
    const id = await freshHeldPayment();
    const { error } = await seller.client
      .from('payments')
      .update({ status: 'released' })
      .eq('id', id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('payments').select('status').eq('id', id).single();
    expect(data?.status).toBe('held');
  });

  it('refuses an admin release before the buyer has confirmed', async () => {
    const id = await freshHeldPayment();
    const { error } = await reviewer.client
      .from('payments')
      .update({ status: 'released' })
      .eq('id', id);
    expect(error).not.toBeNull();
  });

  it('allows an admin release once the buyer has confirmed', async () => {
    const id = await freshHeldPayment();
    await buyer.client
      .from('payments')
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq('id', id);

    const { error } = await reviewer.client
      .from('payments')
      .update({ status: 'released', released_by: reviewer.id, released_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).toBeNull();

    const { data } = await admin.from('payments').select('status').eq('id', id).single();
    expect(data?.status).toBe('released');
  });
});

describe('confirmation authority', () => {
  it('refuses to let the seller confirm receipt on the buyer’s behalf', async () => {
    const id = await freshHeldPayment();
    const { error } = await seller.client
      .from('payments')
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).not.toBeNull();
  });
});

describe('terminal states', () => {
  it('refuses to reopen a released payment', async () => {
    const id = await freshHeldPayment();
    await buyer.client
      .from('payments')
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq('id', id);
    await reviewer.client.from('payments').update({ status: 'released' }).eq('id', id);

    const { error } = await reviewer.client
      .from('payments')
      .update({ status: 'held' })
      .eq('id', id);
    expect(error).not.toBeNull();
  });
});

describe('one buyer at a time', () => {
  it('refuses a second live payment on the same listing', async () => {
    await freshHeldPayment();
    const { error } = await admin.from('payments').insert({
      listing_id: listingId,
      buyer_id: stranger.id,
      seller_id: seller.id,
      amount: 4200,
      status: 'initiated',
    });
    expect(error).not.toBeNull();
  });
});

describe('simulation marking', () => {
  it('marks every payment as simulated, so no row can later pass as real', async () => {
    const id = await freshHeldPayment();
    const { data } = await admin
      .from('payments')
      .select('is_simulated, gateway_reference')
      .eq('id', id)
      .single();
    expect(data?.is_simulated).toBe(true);
    expect(data?.gateway_reference).toMatch(/^XPAY-SIM-/);
  });
});
