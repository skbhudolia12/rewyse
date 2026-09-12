import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { estimateBaseValue } from './llm';
import { normalizeTitle } from './parse';
import {
  CATEGORY_DEFAULT_BASE_VALUE,
  CLEARANCE_WINDOW_DAYS,
  PROMPT_VERSION,
} from './constants';
import {
  classifyOutcome,
  computeSuggestion,
  daysUntilMoveout,
  railBaseValue,
  type PriceSuggestion,
} from './rails';
import type { BaseValueSource, FunctionalStatus, ListingCategory } from '@/types/domain';

/**
 * Resolves a base value and turns it into a quote.
 *
 * Order of authority, most trusted first:
 *   1. comparables  -- a row the team curated for this category and keyword
 *   2. price_cache  -- a previous model answer for the same item identity
 *   3. the model    -- a fresh estimate
 *   4. category default -- deterministic, always available
 *
 * The cache is keyed on item identity and NOT on the move-out date, because
 * urgency is pure local arithmetic over the base value. Changing the date must
 * never spend a request from a ~1,000/day quota, and a seller dragging a date
 * picker would otherwise drain it in an afternoon.
 */

export { normalizeTitle };

export interface QuoteRequest {
  title: string;
  category: ListingCategory;
  functionalStatus: FunctionalStatus;
  cosmeticFlaws?: string | null;
  accessories?: string | null;
  moveoutDate: string;
  sellerId: string;
  listingId?: string | null;
  isRepricing?: boolean;
}

export interface Quote extends PriceSuggestion {
  baseValue: number;
  baseValueSource: BaseValueSource;
  reasoning: string;
  daysUntilMoveout: number;
  isClearance: boolean;
  modelUsed: string | null;
  /** True when no model answered and the deterministic fallback produced this. */
  estimated: boolean;
}

/** One seller cannot drain the org-wide model quota on their own. */
const RATE_LIMIT_PER_HOUR = 20;

function cacheKey(req: QuoteRequest): string {
  // Deliberately excludes moveoutDate and functionalStatus: neither reaches the
  // model, so neither may fragment the cache.
  return createHash('sha256')
    .update(
      [
        req.category,
        normalizeTitle(req.title),
        (req.cosmeticFlaws ?? '').trim().toLowerCase(),
        (req.accessories ?? '').trim().toLowerCase(),
        PROMPT_VERSION,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);
}

interface ResolvedBase {
  baseValue: number;
  source: BaseValueSource;
  reasoning: string;
  model: string | null;
  latencyMs: number | null;
  raw: unknown;
}

async function fromComparables(req: QuoteRequest): Promise<ResolvedBase | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('comparables')
    .select('keyword, base_value, note')
    .eq('category', req.category);

  if (!data || data.length === 0) return null;

  const title = normalizeTitle(req.title);
  // Longest keyword wins: "mini fridge" should beat a bare "fridge" row.
  const match = data
    .filter((row) => title.includes(normalizeTitle(row.keyword)))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0];

  if (!match) return null;

  return {
    baseValue: match.base_value,
    source: 'comparables',
    reasoning: 'Based on recent sales of similar items in your cluster.',
    model: null,
    latencyMs: null,
    raw: null,
  };
}

async function fromCache(key: string): Promise<ResolvedBase | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('price_cache')
    .select('base_value, source, model_used, reasoning, hit_count')
    .eq('cache_key', key)
    .maybeSingle();

  if (!data) return null;

  await admin
    .from('price_cache')
    .update({ hit_count: (data.hit_count ?? 0) + 1, last_hit_at: new Date().toISOString() })
    .eq('cache_key', key);

  return {
    baseValue: data.base_value,
    source: data.source as BaseValueSource,
    reasoning: data.reasoning ?? 'Based on a previous estimate for this item.',
    model: data.model_used,
    latencyMs: null,
    raw: null,
  };
}

async function withinRateLimit(sellerId: string): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data } = await admin
    .from('pricing_events')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('base_value_source', 'llm')
    .gte('created_at', since);
  return (data?.length ?? 0) < RATE_LIMIT_PER_HOUR;
}

async function resolveBaseValue(req: QuoteRequest): Promise<ResolvedBase> {
  const comparable = await fromComparables(req);
  if (comparable) return comparable;

  const key = cacheKey(req);
  const cached = await fromCache(key);
  if (cached) return cached;

  if (await withinRateLimit(req.sellerId)) {
    const estimate = await estimateBaseValue({
      title: req.title,
      category: req.category,
      functionalStatus: req.functionalStatus,
      cosmeticFlaws: req.cosmeticFlaws ?? null,
      accessories: req.accessories ?? null,
    });

    if (estimate) {
      const clamped = railBaseValue(estimate.baseValue, req.category);
      const admin = createAdminClient();
      await admin.from('price_cache').upsert(
        {
          cache_key: key,
          base_value: clamped,
          source: 'llm',
          model_used: estimate.model,
          reasoning: estimate.reasoning,
          confidence: estimate.confidence,
          last_hit_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' },
      );

      return {
        baseValue: clamped,
        source: 'llm',
        reasoning: estimate.reasoning,
        model: estimate.model,
        latencyMs: estimate.latencyMs,
        raw: { provider: estimate.provider, confidence: estimate.confidence },
      };
    }
  }

  return {
    baseValue: CATEGORY_DEFAULT_BASE_VALUE[req.category],
    source: 'category_default',
    reasoning: 'A typical price for this category. Adjust it if you know better.',
    model: null,
    latencyMs: null,
    raw: null,
  };
}

/**
 * Produces a quote and records it. Every suggestion shown to a seller writes a
 * pricing_event -- including repricing runs -- because that ledger IS the
 * pilot's measurement of whether urgency pricing gets accepted.
 */
export async function getQuote(req: QuoteRequest, now = new Date()): Promise<Quote> {
  const resolved = await resolveBaseValue(req);
  const days = daysUntilMoveout(req.moveoutDate, now);
  const baseValue = railBaseValue(resolved.baseValue, req.category);

  const suggestion = computeSuggestion({
    baseValue,
    functionalStatus: req.functionalStatus,
    daysUntilMoveout: days,
  });

  const admin = createAdminClient();
  await admin.from('pricing_events').insert({
    listing_id: req.listingId ?? null,
    seller_id: req.sellerId,
    category: req.category,
    title_snapshot: req.title,
    base_value: baseValue,
    base_value_source: resolved.source,
    condition_multiplier: suggestion.conditionMultiplier,
    days_until_moveout: days,
    urgency_factor: suggestion.urgencyFactor,
    fair_min: suggestion.fairMin,
    fair_max: suggestion.fairMax,
    sell_fast_price: suggestion.sellFastPrice,
    model_used: resolved.model,
    prompt_version: PROMPT_VERSION,
    raw_model_response: resolved.raw ?? null,
    latency_ms: resolved.latencyMs,
    is_repricing: req.isRepricing ?? false,
  });

  return {
    ...suggestion,
    baseValue,
    baseValueSource: resolved.source,
    reasoning: resolved.reasoning,
    daysUntilMoveout: days,
    isClearance: days <= CLEARANCE_WINDOW_DAYS,
    modelUsed: resolved.model,
    estimated: resolved.source === 'category_default',
  };
}

/**
 * Records what the seller finally did with the suggestion. Without this the
 * pricing_events table shows what was offered but never whether it was taken,
 * which is exactly the half that matters.
 */
export async function recordAskingPrice(
  listingId: string,
  askingPrice: number,
  suggestion: PriceSuggestion,
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('pricing_events')
    .select('id')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return;

  await admin
    .from('pricing_events')
    .update({
      final_asking_price: askingPrice,
      outcome: classifyOutcome(askingPrice, suggestion),
    })
    .eq('id', data.id);
}
