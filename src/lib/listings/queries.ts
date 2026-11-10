import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { daysUntilMoveout } from '@/lib/pricing/rails';
import { CLEARANCE_WINDOW_DAYS } from '@/lib/pricing/constants';
import type { ListingCategory } from '@/types/domain';

/**
 * Feed queries.
 *
 * Every query here relies on RLS for cluster scoping rather than filtering by
 * campus in the query itself. That is deliberate: the policy is the boundary,
 * and a query that also filtered would quietly mask a policy regression instead
 * of failing loudly in the RLS tests.
 */

const SIGNED_URL_TTL_SECONDS = 3600;

export interface FeedListing {
  id: string;
  title: string;
  category: ListingCategory;
  askingPrice: number;
  suggestedMin: number | null;
  suggestedMax: number | null;
  moveoutDate: string;
  daysLeft: number;
  campusAbbr: string;
  condition: string;
  imageUrl: string | null;
  hasVideo: boolean;
  isFairPrice: boolean;
  isClearance: boolean;
  isBoosted: boolean;
}

interface RawListing {
  id: string;
  title: string;
  category: ListingCategory;
  asking_price: number;
  suggested_price_min: number | null;
  suggested_price_max: number | null;
  moveout_date: string;
  functional_status: string;
  campus: { abbreviation: string } | null;
  listing_media: Array<{ storage_path: string; kind: string; position: number }> | null;
}

const CONDITION_SHORT: Record<string, string> = {
  fully_working: 'Working',
  partially_working: 'Partly working',
  for_parts: 'For parts',
};

const SELECT = `
  id, title, category, asking_price, suggested_price_min, suggested_price_max,
  moveout_date, functional_status,
  campus:campuses(abbreviation),
  listing_media(storage_path, kind, position)
`;

/** Listings with a boost running right now. Read under RLS, so only visible listings count. */
async function activeBoosts(ids: string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const supabase = await createClient();
  const at = now.toISOString();
  const { data } = await supabase
    .from('boosts')
    .select('listing_id')
    .in('listing_id', ids)
    .lte('starts_at', at)
    .gt('ends_at', at);
  return new Set((data ?? []).map((b) => b.listing_id as string));
}

async function decorate(rows: RawListing[], now: Date): Promise<FeedListing[]> {
  const supabase = await createClient();
  const boosted = await activeBoosts(
    rows.map((r) => r.id),
    now,
  );

  return Promise.all(
    rows.map(async (row) => {
      const media = (row.listing_media ?? []).slice().sort((a, b) => a.position - b.position);
      const first = media[0];
      let imageUrl: string | null = null;

      if (first) {
        const { data } = await supabase.storage
          .from('listing-media')
          .createSignedUrl(first.storage_path, SIGNED_URL_TTL_SECONDS);
        imageUrl = data?.signedUrl ?? null;
      }

      const daysLeft = daysUntilMoveout(row.moveout_date, now);

      return {
        id: row.id,
        title: row.title,
        category: row.category,
        askingPrice: row.asking_price,
        suggestedMin: row.suggested_price_min,
        suggestedMax: row.suggested_price_max,
        moveoutDate: row.moveout_date,
        daysLeft,
        campusAbbr: row.campus?.abbreviation ?? '—',
        condition: CONDITION_SHORT[row.functional_status] ?? row.functional_status,
        imageUrl,
        hasVideo: media.some((m) => m.kind === 'video'),
        isFairPrice:
          row.suggested_price_min !== null &&
          row.suggested_price_max !== null &&
          row.asking_price >= row.suggested_price_min &&
          row.asking_price <= row.suggested_price_max,
        isClearance: daysLeft <= CLEARANCE_WINDOW_DAYS,
        isBoosted: boosted.has(row.id),
      };
    }),
  );
}

/** Sellers vacating within the clearance window, soonest first. */
export async function getClearanceListings(limit = 8, now = new Date()): Promise<FeedListing[]> {
  const supabase = await createClient();
  const cutoff = new Date(now.getTime() + CLEARANCE_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data } = await supabase
    .from('listings')
    .select(SELECT)
    .eq('status', 'active')
    .lte('moveout_date', cutoff)
    .order('moveout_date', { ascending: true })
    .limit(limit);

  return decorate((data ?? []) as unknown as RawListing[], now);
}

/**
 * The main grid.
 *
 * Ranking: paid boosts first, then video-verified listings (a seller who
 * filmed the item working has given a stronger signal than a photo), then the
 * soonest move-out.
 */
export async function getFeedListings(
  opts: {
    category?: ListingCategory | undefined;
    query?: string | undefined;
    clearanceOnly?: boolean;
    limit?: number;
  } = {},
  now = new Date(),
): Promise<FeedListing[]> {
  const supabase = await createClient();

  let q = supabase.from('listings').select(SELECT).eq('status', 'active');
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.query) q = q.ilike('title', `%${opts.query}%`);
  if (opts.clearanceOnly) {
    const cutoff = new Date(now.getTime() + CLEARANCE_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    q = q.lte('moveout_date', cutoff);
  }

  const { data } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 48);

  const listings = await decorate((data ?? []) as unknown as RawListing[], now);

  return listings.sort((a, b) => {
    if (a.isBoosted !== b.isBoosted) return a.isBoosted ? -1 : 1;
    if (a.hasVideo !== b.hasVideo) return a.hasVideo ? -1 : 1;
    return a.daysLeft - b.daysLeft;
  });
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from('listings').select('category').eq('status', 'active');

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}
