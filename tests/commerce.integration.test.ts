/**
 * Commerce rules against the real database: pricing, escrow, delivery, payouts, boosts.
 *
 *   npm run test:integration
 *
 * The money is simulated; the authorisation is not. Every test drives the
 * row through the same calls the app makes, as the user who would make them,
 * so a rule enforced only in application code would fail here.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { orderTotals } from '@/lib/fees';

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
const IITD = '22222222-2222-2222-2222-222222222202';
const RUN = `com${Date.now().toString(36)}`;
const ASKING = 4200;

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestUser {
  id: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];

async function makeUser(
  label: string,
  opts: { role?: 'admin'; campus?: string } = {},
): Promise<TestUser> {
  const email = `${RUN}-${label}@example.test`;
  const password = `${RUN}-Passw0rd!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  createdUserIds.push(data.user.id);

  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id,
    full_name: `Commerce ${label}`,
    email,
    campus_id: opts.campus ?? IIITD,
    moveout_date: '2027-06-30',
    email_domain_ok: true,
    id_review_status: 'approved',
    ...(opts.role ? { role: opts.role } : {}),
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  const client = createClient(URL_, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client };
}

let buyer: TestUser;
let crossBuyer: TestUser;
let seller: TestUser;
let stranger: TestUser;
let ops: TestUser;
let listingId: string;

/** What the app's startCheckout does, as the buyer. */
async function startOrder(who: TestUser = buyer, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await who.client
    .from('payments')
    .insert({ listing_id: listingId, buyer_id: who.id, seller_id: seller.id, ...extra })
    .select('id')
    .single();
  if (error) throw new Error(`start order: ${error.message}`);
  return data.id;
}

/** What capturePayment does, as the buyer. */
async function pay(id: string, who: TestUser = buyer) {
  return who.client
    .from('payments')
    .update({ delivery_address: 'Boys Hostel, Room 214', payment_method: 'UPI', status: 'held' })
    .eq('id', id);
}

async function paidOrder(): Promise<string> {
  const id = await startOrder();
  const { error } = await pay(id);
  if (error) throw new Error(`pay: ${error.message}`);
  return id;
}

async function deliver(id: string) {
  for (const step of ['picked_up', 'out_for_delivery', 'delivered']) {
    const { error } = await ops.client.from('payments').update({ delivery_status: step }).eq('id', id);
    if (error) throw new Error(`deliver ${step}: ${error.message}`);
  }
}

async function row(id: string) {
  const { data } = await admin.from('payments').select('*').eq('id', id).single();
  return data!;
}

async function listingStatus() {
  const { data } = await admin.from('listings').select('status').eq('id', listingId).single();
  return data?.status;
}

// Runs even when a test throws, so one failure cannot cascade into the rest
// through the one-live-payment-per-listing index or a sold listing.
afterEach(async () => {
  await admin.from('payments').delete().eq('listing_id', listingId);
  await admin.from('offers').delete().eq('listing_id', listingId);
  await admin.from('conversations').delete().eq('listing_id', listingId);
  await admin.from('boosts').delete().eq('listing_id', listingId);
  await admin.from('listings').update({ status: 'active' }).eq('id', listingId);
});

beforeAll(async () => {
  [buyer, crossBuyer, seller, stranger, ops] = await Promise.all([
    makeUser('buyer'),
    makeUser('crossbuyer', { campus: IITD }),
    makeUser('seller'),
    makeUser('stranger'),
    makeUser('ops', { role: 'admin' }),
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
      asking_price: ASKING,
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

describe('pricing is set by the database', () => {
  it('charges what the TypeScript fee rules quote, for a same-campus order', async () => {
    const p = await row(await startOrder());
    const quoted = orderTotals({ itemAmount: ASKING, sameCampus: true, category: 'appliances' });
    expect({
      itemAmount: p.item_amount,
      convenienceFee: p.convenience_fee,
      deliveryFee: p.delivery_fee,
      total: p.amount,
    }).toEqual(quoted);
  });

  it('charges the cross-campus delivery fee when buyer and seller are on different campuses', async () => {
    const p = await row(await startOrder(crossBuyer));
    expect(p.delivery_fee).toBe(
      orderTotals({ itemAmount: ASKING, sameCampus: false, category: 'appliances' }).deliveryFee,
    );
  });

  it('ignores an amount the client tries to set', async () => {
    const p = await row(await startOrder(buyer, { amount: 1, item_amount: 1, convenience_fee: 0, delivery_fee: 0 }));
    expect(p.item_amount).toBe(ASKING);
    expect(p.amount).toBeGreaterThan(ASKING);
  });

  it('charges the accepted offer rather than the asking price', async () => {
    const { data: conv } = await admin
      .from('conversations')
      .insert({ listing_id: listingId, buyer_id: buyer.id, seller_id: seller.id })
      .select('id')
      .single();
    await admin.from('offers').insert({
      conversation_id: conv!.id,
      listing_id: listingId,
      buyer_id: buyer.id,
      seller_id: seller.id,
      amount: 3600,
      status: 'accepted',
    });
    const p = await row(await startOrder());
    expect(p.item_amount).toBe(3600);
  });

  it('refuses to let the buyer edit an amount after the order exists', async () => {
    const id = await startOrder();
    const { error } = await buyer.client.from('payments').update({ amount: 1 }).eq('id', id);
    expect(error).not.toBeNull();
  });
});

describe('paying', () => {
  it('needs a delivery address', async () => {
    const id = await startOrder();
    const { error } = await buyer.client.from('payments').update({ status: 'held' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('holds the money, dispatches a partner and takes the listing off the market', async () => {
    const p = await row(await paidOrder());
    expect(p.status).toBe('held');
    expect(p.delivery_status).toBe('scheduled');
    expect(p.delivery_partner).toBe('SwiftDrop Logistics');
    expect(p.tracking_id).toMatch(/^SWD/);
    expect(await listingStatus()).toBe('pending_pickup');
  });

  it('refuses to let anyone but the buyer pay', async () => {
    const id = await startOrder();
    const { error } = await pay(id, seller);
    // RLS lets the seller see the row; the guard refuses the checkout fields.
    expect(error).not.toBeNull();
    expect((await row(id)).status).toBe('initiated');
  });

  it('refuses a second buyer on the same item', async () => {
    await paidOrder();
    await expect(startOrder(stranger)).rejects.toThrow();
  });
});

describe('delivery', () => {
  it('refuses delivery updates from the buyer or the seller', async () => {
    const id = await paidOrder();
    const a = await buyer.client.from('payments').update({ delivery_status: 'picked_up' }).eq('id', id);
    const b = await seller.client.from('payments').update({ delivery_status: 'picked_up' }).eq('id', id);
    expect(a.error).not.toBeNull();
    expect(b.error).not.toBeNull();
  });

  it('moves one step at a time', async () => {
    const id = await paidOrder();
    const { error } = await ops.client.from('payments').update({ delivery_status: 'delivered' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('timestamps every step', async () => {
    const id = await paidOrder();
    await deliver(id);
    const p = await row(id);
    expect(p.picked_up_at && p.out_for_delivery_at && p.delivered_at).toBeTruthy();
  });
});

describe('confirmation and payout', () => {
  it('refuses a buyer confirmation before the item is delivered', async () => {
    const id = await paidOrder();
    const { error } = await buyer.client
      .from('payments')
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).not.toBeNull();
  });

  it('refuses to let the seller confirm on the buyer’s behalf', async () => {
    const id = await paidOrder();
    await deliver(id);
    const { error } = await seller.client
      .from('payments')
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).not.toBeNull();
  });

  it('refuses a release by the buyer, and by an admin before confirmation', async () => {
    const id = await paidOrder();
    await deliver(id);
    const a = await buyer.client.from('payments').update({ status: 'released' }).eq('id', id);
    const b = await ops.client.from('payments').update({ status: 'released' }).eq('id', id);
    expect(a.error).not.toBeNull();
    expect(b.error).not.toBeNull();
  });

  it('pays the seller the item price once delivered and confirmed, and marks the item sold', async () => {
    const id = await paidOrder();
    await deliver(id);
    await buyer.client.from('payments').update({ buyer_confirmed_at: new Date().toISOString() }).eq('id', id);
    const { error } = await ops.client
      .from('payments')
      .update({ status: 'released', released_by: ops.id, released_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).toBeNull();

    const p = await row(id);
    expect(p.status).toBe('released');
    expect(p.payout_reference).toMatch(/^PAYOUT-SIM-/);
    expect(p.payout_account_mask).toMatch(/^HDFC Bank ••••\d{4}$/);
    expect(await listingStatus()).toBe('completed');
  });

  it('puts the item back on the market after a refund', async () => {
    const id = await paidOrder();
    const { error } = await ops.client
      .from('payments')
      .update({ status: 'refunded', admin_note: 'Seller cancelled' })
      .eq('id', id);
    expect(error).toBeNull();
    expect(await listingStatus()).toBe('active');
  });

  it('refuses to reopen a settled order', async () => {
    const id = await paidOrder();
    await ops.client.from('payments').update({ status: 'refunded', admin_note: 'x' }).eq('id', id);
    const { error } = await ops.client.from('payments').update({ status: 'held' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('keeps every payment marked as simulated', async () => {
    const p = await row(await paidOrder());
    expect(p.is_simulated).toBe(true);
    expect(p.gateway_reference).toMatch(/^XPAY-SIM-/);
  });
});

describe('privacy', () => {
  it('hides an order from anyone who is not a party to it', async () => {
    const id = await paidOrder();
    const { data } = await stranger.client.from('payments').select('id').eq('id', id);
    expect(data ?? []).toHaveLength(0);
  });

  it('lets the buyer still see the listing after it sells', async () => {
    const id = await paidOrder();
    await deliver(id);
    await buyer.client.from('payments').update({ buyer_confirmed_at: new Date().toISOString() }).eq('id', id);
    await ops.client.from('payments').update({ status: 'released' }).eq('id', id);
    const { data } = await buyer.client.from('listings').select('id').eq('id', listingId);
    expect(data ?? []).toHaveLength(1);
  });
});

describe('boosts', () => {
  it('prices a boost from its plan, whatever the client sends', async () => {
    const { data, error } = await seller.client
      .from('boosts')
      .insert({ listing_id: listingId, seller_id: seller.id, plan: 'boost_7d', amount: 1, ends_at: new Date().toISOString() })
      .select('amount, starts_at, ends_at')
      .single();
    expect(error).toBeNull();
    expect(data!.amount).toBe(49);
    const days = (new Date(data!.ends_at).getTime() - new Date(data!.starts_at).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it('extends a running boost rather than overlapping it', async () => {
    const first = await seller.client
      .from('boosts')
      .insert({ listing_id: listingId, seller_id: seller.id, plan: 'boost_3d' })
      .select('ends_at')
      .single();
    const second = await seller.client
      .from('boosts')
      .insert({ listing_id: listingId, seller_id: seller.id, plan: 'boost_3d' })
      .select('starts_at')
      .single();
    expect(second.data!.starts_at).toBe(first.data!.ends_at);
  });

  it('refuses to let someone boost a listing that is not theirs', async () => {
    const { error } = await stranger.client
      .from('boosts')
      .insert({ listing_id: listingId, seller_id: stranger.id, plan: 'boost_3d' });
    expect(error).not.toBeNull();
  });

  it('lets other students on the cluster see that a listing is boosted', async () => {
    await seller.client.from('boosts').insert({ listing_id: listingId, seller_id: seller.id, plan: 'boost_3d' });
    const { data } = await crossBuyer.client.from('boosts').select('listing_id').eq('listing_id', listingId);
    expect(data ?? []).toHaveLength(1);
  });
});
