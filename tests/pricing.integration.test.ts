/**
 * Pricing engine against the real database.
 *
 *   npm run test:integration
 *
 * Spends ZERO model quota: the provider module is stubbed (see below). Burning
 * ~1,000 free requests a day on a test suite would take pricing offline for
 * real sellers, and a test that depends on a non-deterministic model is a flaky
 * test by construction.
 *
 * To check the model itself actually answers, run `npm run check:llm` once.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The model provider is stubbed, not disabled via the environment.
 *
 * serverEnv() memoizes the parsed environment, so deleting a key from
 * process.env mid-run does nothing once it has been read -- a test written that
 * way passes only while the model happens to be broken, and makes a real billed
 * call as soon as it is fixed. Stubbing the module is the honest seam: zero
 * quota, deterministic, and it lets us assert the model is never reached when
 * a comparable already answers.
 */
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
// The service reads process.env through the validated env module.
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const IIITD = '22222222-2222-2222-2222-222222222201';
const RUN = `px${Date.now().toString(36)}`;

let sellerId: string;
let getQuote: typeof import('@/lib/pricing/service').getQuote;
let estimateBaseValue: ReturnType<typeof vi.fn>;

/** Far enough out that urgency sits at its ceiling, so base maths is isolated. */
const FAR_MOVEOUT = '2027-06-30';

beforeAll(async () => {
  ({ getQuote } = await import('@/lib/pricing/service'));
  ({ estimateBaseValue } = (await import('@/lib/pricing/llm')) as unknown as {
    estimateBaseValue: ReturnType<typeof vi.fn>;
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: `${RUN}@example.test`,
    password: `${RUN}-Passw0rd!`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  sellerId = data.user.id;

  await admin.from('profiles').insert({
    id: sellerId,
    full_name: 'Pricing Tester',
    email: `${RUN}@example.test`,
    campus_id: IIITD,
    moveout_date: FAR_MOVEOUT,
    email_domain_ok: true,
    id_review_status: 'approved',
  });
}, 60_000);

afterAll(async () => {
  await admin.from('pricing_events').delete().eq('seller_id', sellerId);
  await admin.auth.admin.deleteUser(sellerId);
}, 60_000);

describe('comparables path', () => {
  it('uses a seeded comparable instead of calling a model', async () => {
    const quote = await getQuote({
      title: 'Dell 24 inch monitor',
      category: 'electronics',
      functionalStatus: 'fully_working',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });

    expect(quote.baseValueSource).toBe('comparables');
    expect(quote.baseValue).toBe(6000); // seeded "monitor" row
    expect(quote.modelUsed).toBeNull();
    // The whole point of the comparables tier: a curated row short-circuits
    // before any request is spent.
    expect(estimateBaseValue).not.toHaveBeenCalled();
  });

  it('prefers the longest matching keyword', async () => {
    const quote = await getQuote({
      title: 'Compact mini fridge for hostel room',
      category: 'appliances',
      functionalStatus: 'fully_working',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });
    expect(quote.baseValue).toBe(5500); // "mini fridge", not a generic row
  });

  it('applies the condition multiplier to a comparable', async () => {
    const working = await getQuote({
      title: 'study table',
      category: 'furniture',
      functionalStatus: 'fully_working',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });
    const parts = await getQuote({
      title: 'study table',
      category: 'furniture',
      functionalStatus: 'for_parts',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });
    expect(parts.fairMin).toBeLessThan(working.fairMin);
  });
});

describe('urgency', () => {
  it('quotes a lower sell-fast price as the move-out date approaches', async () => {
    const base = {
      title: 'study chair',
      category: 'furniture' as const,
      functionalStatus: 'fully_working' as const,
      sellerId,
    };
    const far = await getQuote({ ...base, moveoutDate: FAR_MOVEOUT });
    const near = await getQuote({ ...base, moveoutDate: isoDaysFromNow(0) });

    expect(near.sellFastPrice).toBeLessThan(far.sellFastPrice);
    expect(near.isClearance).toBe(true);
    expect(far.isClearance).toBe(false);
  });

  it('never quotes a sell-fast price above the fair minimum', async () => {
    for (const days of [0, 3, 7, 21, 90]) {
      const quote = await getQuote({
        title: 'bookshelf',
        category: 'furniture',
        functionalStatus: 'fully_working',
        moveoutDate: isoDaysFromNow(days),
        sellerId,
      });
      expect(quote.sellFastPrice).toBeLessThanOrEqual(quote.fairMin);
    }
  });
});

describe('deterministic fallback', () => {
  it('still returns a usable quote when no provider answers', async () => {
    // A title matching no comparable, so the chain runs all the way to its end.
    const quote = await getQuote({
      title: `${RUN} unheard-of contraption`,
      category: 'other',
      functionalStatus: 'fully_working',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });

    expect(estimateBaseValue).toHaveBeenCalled();
    expect(quote.baseValueSource).toBe('category_default');
    expect(quote.estimated).toBe(true);
    expect(quote.sellFastPrice).toBeGreaterThan(0);
    expect(quote.fairMax).toBeGreaterThan(quote.fairMin);
  });

  it('marks a fallback quote as estimated so the UI can say so', async () => {
    const quote = await getQuote({
      title: `${RUN} another unknown thing`,
      category: 'other',
      functionalStatus: 'fully_working',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });
    expect(quote.estimated).toBe(true);
    expect(quote.modelUsed).toBeNull();
  });
});

describe('the hypothesis ledger', () => {
  it('writes a pricing_event for every suggestion shown', async () => {
    const { data: before } = await admin
      .from('pricing_events')
      .select('id')
      .eq('seller_id', sellerId);

    await getQuote({
      title: 'mechanical keyboard',
      category: 'electronics',
      functionalStatus: 'fully_working',
      moveoutDate: FAR_MOVEOUT,
      sellerId,
    });

    const { data: after } = await admin
      .from('pricing_events')
      .select('id')
      .eq('seller_id', sellerId);

    expect((after ?? []).length).toBe((before ?? []).length + 1);
  });

  it('records the inputs needed to reconstruct the quote later', async () => {
    await getQuote({
      title: 'desk lamp',
      category: 'furniture',
      functionalStatus: 'partially_working',
      moveoutDate: isoDaysFromNow(2),
      sellerId,
      isRepricing: true,
    });

    const { data } = await admin
      .from('pricing_events')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(data).toMatchObject({
      category: 'furniture',
      title_snapshot: 'desk lamp',
      days_until_moveout: 2,
      is_repricing: true,
    });
    // prompt_version is what lets a mid-pilot prompt change be segmented out
    // instead of silently blended into one misleading average.
    expect(data?.prompt_version).toBeTruthy();
    expect(Number(data?.urgency_factor)).toBeGreaterThan(0);
  });
});

function isoDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
