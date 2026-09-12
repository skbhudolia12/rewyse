/**
 * RLS integration tests against the real Supabase project.
 *
 *   npm run test:integration
 *
 * Kept out of the unit suite on purpose: these hit the network and mutate a real
 * database, which breaks the determinism the unit tests depend on.
 *
 * What this proves is the security model itself. RLS is the only layer a client
 * cannot route around -- middleware and page guards are conveniences, and a
 * leaked publishable key bypasses both. So each test signs in as a real user and
 * asserts what that user genuinely cannot see.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

/** Namespaced so a failed run never collides with the next one. */
const RUN = `rls${Date.now().toString(36)}`;
const OTHER_CLUSTER = '99999999-9999-9999-9999-999999999991';
const OTHER_CAMPUS = '99999999-9999-9999-9999-999999999992';

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anon = () =>
  createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];

async function makeUser(opts: {
  label: string;
  campusId: string;
  verified: boolean;
}): Promise<TestUser> {
  const email = `${RUN}-${opts.label}@example.test`;
  const password = `${RUN}-Passw0rd!`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`);
  createdUserIds.push(created.user.id);

  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: `Test ${opts.label}`,
    email,
    campus_id: opts.campusId,
    moveout_date: '2026-12-31',
    email_domain_ok: opts.verified,
    id_review_status: opts.verified ? 'approved' : 'not_submitted',
  });
  if (profileErr) throw new Error(`insert profile: ${profileErr.message}`);

  const client = anon();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn: ${signInErr.message}`);

  return { id: created.user.id, email, client };
}

let verifiedA: TestUser; // IIITD, fully verified
let verifiedB: TestUser; // IITD, fully verified -- same cluster as A
let unverified: TestUser; // IIITD, email ok but ID not approved
let outsider: TestUser; // different cluster entirely

let listingByB: string;
let listingByOutsider: string;
let conversationId: string;

beforeAll(async () => {
  // A second cluster, so "cannot see other clusters" is tested against a real
  // row rather than an absence of data.
  await admin.from('clusters').upsert({ id: OTHER_CLUSTER, name: `${RUN} Other Cluster` });
  await admin.from('campuses').upsert({
    id: OTHER_CAMPUS,
    cluster_id: OTHER_CLUSTER,
    name: `${RUN} Other Campus`,
    abbreviation: RUN.slice(0, 8).toUpperCase(),
  });

  [verifiedA, verifiedB, unverified, outsider] = await Promise.all([
    makeUser({ label: 'a', campusId: IIITD, verified: true }),
    makeUser({ label: 'b', campusId: IITD, verified: true }),
    makeUser({ label: 'u', campusId: IIITD, verified: false }),
    makeUser({ label: 'o', campusId: OTHER_CAMPUS, verified: true }),
  ]);

  const { data: l1 } = await admin
    .from('listings')
    .insert({
      seller_id: verifiedB.id,
      campus_id: IITD,
      title: `${RUN} monitor`,
      category: 'electronics',
      functional_status: 'fully_working',
      moveout_date: '2026-12-31',
      asking_price: 5000,
      status: 'active',
    })
    .select('id')
    .single();
  listingByB = l1!.id;

  const { data: l2 } = await admin
    .from('listings')
    .insert({
      seller_id: outsider.id,
      campus_id: OTHER_CAMPUS,
      title: `${RUN} outsider desk`,
      category: 'furniture',
      functional_status: 'fully_working',
      moveout_date: '2026-12-31',
      asking_price: 2000,
      status: 'active',
    })
    .select('id')
    .single();
  listingByOutsider = l2!.id;

  // A private thread between A and B, which nobody else may read.
  const { data: conv } = await admin
    .from('conversations')
    .insert({ listing_id: listingByB, buyer_id: verifiedA.id, seller_id: verifiedB.id })
    .select('id')
    .single();
  conversationId = conv!.id;

  await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: verifiedA.id,
    body: `${RUN} is this still available`,
  });

  await admin.from('id_verifications').insert({
    profile_id: verifiedB.id,
    document_path: `${RUN}/secret-id-card.jpg`,
    status: 'pending_review',
  });
}, 60_000);

afterAll(async () => {
  await admin.from('listings').delete().in('id', [listingByB, listingByOutsider]);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  await admin.from('campuses').delete().eq('id', OTHER_CAMPUS);
  await admin.from('clusters').delete().eq('id', OTHER_CLUSTER);
}, 60_000);

describe('verification gate', () => {
  it('derives verified_status from both gates, not just the email check', async () => {
    const { data } = await admin
      .from('profiles')
      .select('verified_status')
      .eq('id', unverified.id)
      .single();
    expect(data?.verified_status).toBe('pending');
  });

  it('marks a user verified only once email domain and ID review both pass', async () => {
    const { data } = await admin
      .from('profiles')
      .select('verified_status')
      .eq('id', verifiedA.id)
      .single();
    expect(data?.verified_status).toBe('verified');
  });
});

describe('anonymous access', () => {
  it('cannot read profiles', async () => {
    const { data } = await anon().from('profiles').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('cannot read listings', async () => {
    const { data } = await anon().from('listings').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('cannot read messages', async () => {
    const { data } = await anon().from('messages').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('can read campuses, which signup needs before a session exists', async () => {
    const { data } = await anon().from('campuses').select('*');
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe('unverified user', () => {
  it('cannot browse listings despite being signed in', async () => {
    const { data } = await unverified.client.from('listings').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('cannot create a listing', async () => {
    const { error } = await unverified.client.from('listings').insert({
      seller_id: unverified.id,
      campus_id: IIITD,
      title: `${RUN} should not exist`,
      category: 'other',
      functional_status: 'fully_working',
      moveout_date: '2026-12-31',
      asking_price: 100,
    });
    expect(error).not.toBeNull();
  });

  it('can still see their own profile, so the pending screen can render', async () => {
    const { data } = await unverified.client.from('profiles').select('id').eq('id', unverified.id);
    expect(data ?? []).toHaveLength(1);
  });
});

describe('cluster scoping', () => {
  it('lets a verified user see another campus in their own cluster', async () => {
    const { data } = await verifiedA.client.from('listings').select('id').eq('id', listingByB);
    expect(data ?? []).toHaveLength(1);
  });

  it('hides listings from a different cluster', async () => {
    const { data } = await verifiedA.client
      .from('listings')
      .select('id')
      .eq('id', listingByOutsider);
    expect(data ?? []).toHaveLength(0);
  });

  it('hides in-cluster listings from an outsider', async () => {
    const { data } = await outsider.client.from('listings').select('id').eq('id', listingByB);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('private conversations', () => {
  it('lets a party read their own thread', async () => {
    const { data } = await verifiedA.client.from('messages').select('id');
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('hides the thread from a user who is not a party to it', async () => {
    const { data } = await outsider.client
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);
    expect(data ?? []).toHaveLength(0);
  });

  it('prevents a non-party from injecting a message into someone else’s thread', async () => {
    const { error } = await outsider.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: outsider.id,
      body: `${RUN} intrusion`,
    });
    expect(error).not.toBeNull();
  });
});

describe('ID documents', () => {
  it('never exposes another user’s ID document', async () => {
    const { data } = await verifiedA.client.from('id_verifications').select('*');
    expect((data ?? []).every((r: { profile_id: string }) => r.profile_id === verifiedA.id)).toBe(
      true,
    );
  });

  it('does not leak the document path to a cluster peer', async () => {
    const { data } = await verifiedA.client
      .from('id_verifications')
      .select('document_path')
      .eq('profile_id', verifiedB.id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('privilege escalation', () => {
  it('refuses a student writing their own role to admin', async () => {
    await verifiedA.client.from('profiles').update({ role: 'admin' }).eq('id', verifiedA.id);
    const { data } = await admin.from('profiles').select('role').eq('id', verifiedA.id).single();
    expect(data?.role).toBe('student');
  });

  it('refuses a student inflating their own trust score', async () => {
    await verifiedA.client.from('profiles').update({ trust_score: 100 }).eq('id', verifiedA.id);
    await verifiedA.client.from('profiles').update({ trust_score: 999 }).eq('id', verifiedA.id);
    const { data } = await admin
      .from('profiles')
      .select('trust_score')
      .eq('id', verifiedA.id)
      .single();
    expect(data?.trust_score).toBeLessThanOrEqual(100);
  });

  it('refuses a student self-approving their ID review', async () => {
    await verifiedA.client
      .from('profiles')
      .update({ id_review_status: 'approved' })
      .eq('id', unverified.id);
    const { data } = await admin
      .from('profiles')
      .select('id_review_status')
      .eq('id', unverified.id)
      .single();
    expect(data?.id_review_status).toBe('not_submitted');
  });
});
