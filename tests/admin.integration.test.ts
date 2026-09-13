/**
 * Admin console queries against the real database.
 *
 *   npm run test:integration
 *
 * These issue the EXACT select strings the admin pages issue, imported from
 * src/lib/admin/queries.ts rather than retyped. That is the whole point: the
 * ID queue shipped broken because `id_verifications` carries two foreign keys
 * to `profiles`, the embed did not name one, and PostgREST refused the query --
 * which the operator saw as "Nothing waiting" with an error underneath.
 *
 * A test that rebuilds the query by hand would have passed. A test that sends
 * what the page sends could not have.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PAYMENTS_QUEUE_SELECT, PENDING_VERIFICATIONS_SELECT } from '@/lib/admin/queries';

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
const RUN = `adm${Date.now().toString(36)}`;

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestUser {
  id: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];

async function makeUser(label: string, opts: { role?: 'admin'; verified?: boolean } = {}) {
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
    full_name: `Admin test ${label}`,
    email,
    campus_id: IIITD,
    hostel_or_hall: 'Test Block',
    moveout_date: '2027-06-30',
    email_domain_ok: true,
    id_review_status: opts.verified === false ? 'pending_review' : 'approved',
    ...(opts.role ? { role: opts.role } : {}),
  });

  const client = createClient(URL_, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client } satisfies TestUser;
}

let reviewer: TestUser;
let student: TestUser;
let applicant: TestUser;
let verificationId: string;

beforeAll(async () => {
  [reviewer, student, applicant] = await Promise.all([
    makeUser('reviewer', { role: 'admin' }),
    makeUser('student'),
    makeUser('applicant', { verified: false }),
  ]);

  const { data, error } = await admin
    .from('id_verifications')
    .insert({
      profile_id: applicant.id,
      document_path: `${applicant.id}/${RUN}-id.jpg`,
      status: 'pending_review',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed verification: ${error.message}`);
  verificationId = data.id;
}, 60_000);

afterAll(async () => {
  await admin.from('id_verifications').delete().eq('id', verificationId);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe('ID verification queue', () => {
  it('loads with the embed the page actually sends', async () => {
    const { data, error } = await reviewer.client
      .from('id_verifications')
      .select(PENDING_VERIFICATIONS_SELECT)
      .eq('status', 'pending_review')
      .order('submitted_at', { ascending: true });

    // The original failure: "more than one relationship was found".
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('returns the applicant with their profile and campus joined', async () => {
    const { data } = await reviewer.client
      .from('id_verifications')
      .select(PENDING_VERIFICATIONS_SELECT)
      .eq('id', verificationId)
      .single();

    const row = data as unknown as {
      profiles: { email: string; campuses: { abbreviation: string } | null } | null;
    } | null;

    expect(row?.profiles?.email).toContain(RUN);
    expect(row?.profiles?.campuses?.abbreviation).toBe('IIITD');
  });

  it('shows an ordinary student nothing, whatever the query', async () => {
    const { data } = await student.client
      .from('id_verifications')
      .select(PENDING_VERIFICATIONS_SELECT)
      .eq('status', 'pending_review');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('reviewing an ID', () => {
  it('approves, mirrors to the profile, and destroys the document path', async () => {
    const { error } = await reviewer.client
      .from('id_verifications')
      .update({
        status: 'approved',
        reviewed_by: reviewer.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', verificationId);
    expect(error).toBeNull();

    const { data: row } = await admin
      .from('id_verifications')
      .select('status, document_path')
      .eq('id', verificationId)
      .single();

    expect(row?.status).toBe('approved');
    // Retention policy: the decision is kept, the photograph is not.
    expect(row?.document_path).toBeNull();

    const { data: profile } = await admin
      .from('profiles')
      .select('id_review_status, verified_status')
      .eq('id', applicant.id)
      .single();

    expect(profile?.id_review_status).toBe('approved');
    expect(profile?.verified_status).toBe('verified');
  });

  it('refuses to let a student review their own submission', async () => {
    const { data: fresh } = await admin
      .from('id_verifications')
      .insert({
        profile_id: student.id,
        document_path: `${student.id}/${RUN}-self.jpg`,
        status: 'pending_review',
      })
      .select('id')
      .single();

    await student.client
      .from('id_verifications')
      .update({ status: 'approved' })
      .eq('id', fresh!.id);

    const { data: after } = await admin
      .from('id_verifications')
      .select('status')
      .eq('id', fresh!.id)
      .single();

    expect(after?.status).toBe('pending_review');
    await admin.from('id_verifications').delete().eq('id', fresh!.id);
  });
});

describe('payments queue', () => {
  it('loads with the embed the page actually sends', async () => {
    // payments carries four foreign keys to profiles, so every embed here has
    // to name its constraint too.
    const { error } = await reviewer.client
      .from('payments')
      .select(PAYMENTS_QUEUE_SELECT)
      .order('created_at', { ascending: false })
      .limit(10);
    expect(error).toBeNull();
  });
});
