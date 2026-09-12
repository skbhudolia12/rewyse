/**
 * Storage RLS tests against the real Supabase project.
 *
 *   npm run test:integration
 *
 * Supabase Storage enforces its own policies on storage.objects, entirely
 * separate from the table policies. A bucket can therefore leak everything even
 * when every table is locked down correctly, so it gets its own tests.
 *
 * The ID-document bucket is the most sensitive surface in the product: it holds
 * photographs of real students' ID cards.
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

const RUN = `st${Date.now().toString(36)}`;
const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A 1x1 JPEG. Content is irrelevant; only the access rules are under test. */
const PIXEL = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  ),
  (c) => c.charCodeAt(0),
);

interface TestUser {
  id: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];

async function makeUser(label: string, opts: { verified: boolean; role?: 'admin' }) {
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
    full_name: `Storage ${label}`,
    email,
    campus_id: IIITD,
    moveout_date: '2026-12-31',
    email_domain_ok: opts.verified,
    id_review_status: opts.verified ? 'approved' : 'not_submitted',
    ...(opts.role ? { role: opts.role } : {}),
  });

  const client = createClient(URL_, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);

  return { id: data.user.id, client } satisfies TestUser;
}

let alice: TestUser;
let bob: TestUser;
let unverified: TestUser;
let reviewer: TestUser;
let alicesIdPath: string;

beforeAll(async () => {
  [alice, bob, unverified, reviewer] = await Promise.all([
    makeUser('alice', { verified: true }),
    makeUser('bob', { verified: true }),
    makeUser('unverified', { verified: false }),
    makeUser('reviewer', { verified: true, role: 'admin' }),
  ]);

  alicesIdPath = `${alice.id}/${RUN}-id.jpg`;
  const { error } = await alice.client.storage
    .from('id-documents')
    .upload(alicesIdPath, PIXEL, { contentType: 'image/jpeg' });
  if (error) throw new Error(`alice upload: ${error.message}`);
}, 60_000);

afterAll(async () => {
  await admin.storage.from('id-documents').remove([alicesIdPath]);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe('id-documents bucket', () => {
  it('lets a student upload into their own folder', async () => {
    const { error } = await alice.client.storage
      .from('id-documents')
      .upload(`${alice.id}/${RUN}-second.jpg`, PIXEL, { contentType: 'image/jpeg' });
    expect(error).toBeNull();
    await admin.storage.from('id-documents').remove([`${alice.id}/${RUN}-second.jpg`]);
  });

  it('refuses an upload into another student’s folder', async () => {
    const { error } = await bob.client.storage
      .from('id-documents')
      .upload(`${alice.id}/${RUN}-planted.jpg`, PIXEL, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });

  it('refuses to serve another student’s ID document', async () => {
    const { data, error } = await bob.client.storage.from('id-documents').download(alicesIdPath);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('refuses to sign a URL for another student’s ID document', async () => {
    const { data } = await bob.client.storage
      .from('id-documents')
      .createSignedUrl(alicesIdPath, 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });

  it('lets the owner read their own document back', async () => {
    const { data, error } = await alice.client.storage
      .from('id-documents')
      .download(alicesIdPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('lets a reviewer read any document, which is how the queue works', async () => {
    const { data, error } = await reviewer.client.storage
      .from('id-documents')
      .download(alicesIdPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('is not a public bucket', async () => {
    const anon = createClient(URL_, PUBLISHABLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const publicUrl = anon.storage.from('id-documents').getPublicUrl(alicesIdPath).data.publicUrl;
    const res = await fetch(publicUrl);
    expect(res.ok).toBe(false);
  });
});

describe('listing-media bucket', () => {
  it('refuses uploads from a student who has not cleared both gates', async () => {
    const { error } = await unverified.client.storage
      .from('listing-media')
      .upload(`${unverified.id}/${RUN}-item.jpg`, PIXEL, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });

  it('allows a verified seller to upload into their own folder', async () => {
    const path = `${alice.id}/${RUN}-item.jpg`;
    const { error } = await alice.client.storage
      .from('listing-media')
      .upload(path, PIXEL, { contentType: 'image/jpeg' });
    expect(error).toBeNull();
    await admin.storage.from('listing-media').remove([path]);
  });

  it('refuses a verified seller uploading into someone else’s folder', async () => {
    const { error } = await bob.client.storage
      .from('listing-media')
      .upload(`${alice.id}/${RUN}-planted-item.jpg`, PIXEL, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });
});
