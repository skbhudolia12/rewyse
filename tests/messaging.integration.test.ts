/**
 * Chat, offers and meetups against the real database.
 *
 *   npm run test:integration
 *
 * Issues the EXACT select strings the pages issue, imported from
 * src/lib/messaging/queries.ts. Every embed here joins a table with more than
 * one foreign key to `profiles`, which is precisely the shape that shipped the
 * ID queue broken.
 *
 * The authorisation assertions matter more than the happy paths: an offer you
 * made is not one you may accept, and a meetup you proposed is not one you may
 * confirm. Both are enforced by triggers in 0008, and both are trivially
 * exploitable if they are not.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MEETUPS_SELECT,
  MESSAGES_SELECT,
  OFFERS_SELECT,
  THREAD_DETAIL_SELECT,
  THREAD_LIST_SELECT,
  buildTimeline,
} from '@/lib/messaging/queries';

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
const RUN = `msg${Date.now().toString(36)}`;

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
    full_name: `Msg ${label}`,
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

let buyer: TestUser;
let seller: TestUser;
let stranger: TestUser;
let listingId: string;
let conversationId: string;
let meetupPointId: string;

async function resetThread() {
  await admin.from('offers').delete().eq('listing_id', listingId);
  await admin.from('meetup_proposals').delete().eq('conversation_id', conversationId);
  await admin.from('messages').delete().eq('conversation_id', conversationId);
  await admin.from('conversations').update({ status: 'open' }).eq('id', conversationId);
  await admin.from('listings').update({ status: 'active' }).eq('id', listingId);
}

async function pendingOfferFrom(who: 'buyer' | 'seller', amount = 3000) {
  const { data, error } = await admin
    .from('offers')
    .insert({
      conversation_id: conversationId,
      listing_id: listingId,
      buyer_id: buyer.id,
      seller_id: seller.id,
      amount,
      // A counter row is what marks the seller as proposer.
      counter_of: null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed offer: ${error.message}`);
  void who;
  return data.id;
}

beforeAll(async () => {
  [buyer, seller, stranger] = await Promise.all([
    makeUser('buyer'),
    makeUser('seller'),
    makeUser('stranger'),
  ]);

  const { data: listing, error: le } = await admin
    .from('listings')
    .insert({
      seller_id: seller.id,
      campus_id: IIITD,
      title: `${RUN} study chair`,
      category: 'furniture',
      functional_status: 'fully_working',
      moveout_date: '2027-06-30',
      asking_price: 4000,
      suggested_price_min: 3400,
      suggested_price_max: 4200,
      suggested_sell_fast_price: 3000,
      status: 'active',
    })
    .select('id')
    .single();
  if (le) throw new Error(`seed listing: ${le.message}`);
  listingId = listing.id;

  const { data: conv, error: ce } = await admin
    .from('conversations')
    .insert({ listing_id: listingId, buyer_id: buyer.id, seller_id: seller.id })
    .select('id')
    .single();
  if (ce) throw new Error(`seed conversation: ${ce.message}`);
  conversationId = conv.id;

  const { data: point } = await admin
    .from('safe_meetup_points')
    .select('id')
    .eq('campus_id', IIITD)
    .eq('active', true)
    .limit(1)
    .single();
  meetupPointId = point!.id;
}, 60_000);

beforeEach(resetThread);

afterAll(async () => {
  await admin.from('conversations').delete().eq('id', conversationId);
  await admin.from('listings').delete().eq('id', listingId);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe('page queries', () => {
  it('loads the thread list with the embeds the page sends', async () => {
    const { data, error } = await buyer.client
      .from('conversations')
      .select(THREAD_LIST_SELECT)
      .order('updated_at', { ascending: false });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('loads the thread detail with both parties resolved', async () => {
    const { data, error } = await buyer.client
      .from('conversations')
      .select(THREAD_DETAIL_SELECT)
      .eq('id', conversationId)
      .single();
    expect(error).toBeNull();

    const row = data as unknown as {
      buyer: { full_name: string } | null;
      seller: { full_name: string } | null;
      listing: { title: string } | null;
    };
    expect(row.buyer?.full_name).toContain('Msg');
    expect(row.seller?.full_name).toContain('Msg');
    expect(row.listing?.title).toContain(RUN);
  });

  it('loads offers and meetups with their selects', async () => {
    const offers = await buyer.client.from('offers').select(OFFERS_SELECT).eq('conversation_id', conversationId);
    const meetups = await buyer.client.from('meetup_proposals').select(MEETUPS_SELECT).eq('conversation_id', conversationId);
    expect(offers.error).toBeNull();
    expect(meetups.error).toBeNull();
  });

  it('shows a stranger nothing', async () => {
    const { data } = await stranger.client
      .from('conversations')
      .select(THREAD_LIST_SELECT)
      .eq('id', conversationId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('messages', () => {
  it('lets a party post and the other read it', async () => {
    const { error } = await buyer.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: buyer.id,
      body: 'Is this still available?',
    });
    expect(error).toBeNull();

    const { data } = await seller.client
      .from('messages')
      .select(MESSAGES_SELECT)
      .eq('conversation_id', conversationId);
    expect((data ?? []).length).toBe(1);
  });

  it('refuses a message sent under someone else’s name', async () => {
    const { error } = await buyer.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: seller.id,
      body: 'Forged',
    });
    expect(error).not.toBeNull();
  });
});

describe('offer authority', () => {
  it('refuses to let the proposer accept their own offer', async () => {
    const id = await pendingOfferFrom('buyer');
    const { error } = await buyer.client.from('offers').update({ status: 'accepted' }).eq('id', id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('offers').select('status').eq('id', id).single();
    expect(data?.status).toBe('pending');
  });

  it('lets the other party accept', async () => {
    const id = await pendingOfferFrom('buyer');
    const { error } = await seller.client.from('offers').update({ status: 'accepted' }).eq('id', id);
    expect(error).toBeNull();

    const { data } = await admin.from('offers').select('status, resolved_at').eq('id', id).single();
    expect(data?.status).toBe('accepted');
    expect(data?.resolved_at).not.toBeNull();
  });

  it('refuses a stranger responding at all', async () => {
    const id = await pendingOfferFrom('buyer');
    await stranger.client.from('offers').update({ status: 'accepted' }).eq('id', id);
    const { data } = await admin.from('offers').select('status').eq('id', id).single();
    expect(data?.status).toBe('pending');
  });

  it('refuses to re-decide a resolved offer', async () => {
    const id = await pendingOfferFrom('buyer');
    await seller.client.from('offers').update({ status: 'accepted' }).eq('id', id);
    const { error } = await seller.client.from('offers').update({ status: 'rejected' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('supersedes other pending offers when one is accepted', async () => {
    const first = await pendingOfferFrom('buyer', 2800);
    const second = await pendingOfferFrom('buyer', 3100);

    await seller.client.from('offers').update({ status: 'accepted' }).eq('id', second);

    const { data } = await admin.from('offers').select('id, status').eq('listing_id', listingId);
    const byId = Object.fromEntries((data ?? []).map((o) => [o.id, o.status]));
    expect(byId[second]).toBe('accepted');
    // Otherwise a seller could accept two buyers for the same item.
    expect(byId[first]).toBe('expired');
  });
});

describe('meetup authority', () => {
  async function proposal(by: TestUser) {
    const { data, error } = await by.client
      .from('meetup_proposals')
      .insert({
        conversation_id: conversationId,
        proposed_by: by.id,
        meetup_point_id: meetupPointId,
        proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`propose: ${error.message}`);
    return data.id;
  }

  it('refuses to let the proposer accept their own meetup', async () => {
    const id = await proposal(seller);
    const { error } = await seller.client
      .from('meetup_proposals')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).not.toBeNull();
  });

  it('confirms the conversation and reserves the listing when the other party accepts', async () => {
    const id = await proposal(seller);
    const { error } = await buyer.client
      .from('meetup_proposals')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).toBeNull();

    const { data: conv } = await admin
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .single();
    const { data: listing } = await admin
      .from('listings')
      .select('status')
      .eq('id', listingId)
      .single();

    expect(conv?.status).toBe('confirmed');
    expect(listing?.status).toBe('pending_pickup');
  });

  it('refuses a meetup point on a campus neither party attends', async () => {
    const { data: foreign } = await admin
      .from('safe_meetup_points')
      .select('id')
      .neq('campus_id', IIITD)
      .limit(1)
      .single();

    const { error } = await buyer.client.from('meetup_proposals').insert({
      conversation_id: conversationId,
      proposed_by: buyer.id,
      meetup_point_id: foreign!.id,
      proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });
});

describe('timeline', () => {
  it('merges the three streams in chronological order', () => {
    const timeline = buildTimeline(
      [{ id: 'm1', sender_id: 'a', body: 'hi', created_at: '2026-01-01T10:00:00Z' }],
      [
        {
          id: 'o1',
          amount: 100,
          status: 'pending',
          buyer_id: 'a',
          seller_id: 'b',
          counter_of: null,
          created_at: '2026-01-01T09:00:00Z',
        },
      ],
      [
        {
          id: 'p1',
          proposed_by: 'b',
          proposed_time: '2026-01-02T10:00:00Z',
          accepted_at: null,
          cancelled_at: null,
          created_at: '2026-01-01T11:00:00Z',
          point: { name: 'Library Foyer' },
        },
      ],
    );

    expect(timeline.map((e) => e.kind)).toEqual(['offer', 'message', 'meetup']);
  });

  it('attributes a counter-offer to the seller, who is the one proposing it', () => {
    const [entry] = buildTimeline(
      [],
      [
        {
          id: 'o2',
          amount: 200,
          status: 'pending',
          buyer_id: 'buyer',
          seller_id: 'seller',
          counter_of: 'o1',
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
      [],
    );
    expect(entry).toMatchObject({ kind: 'offer', proposedBy: 'seller', isCounter: true });
  });
});
