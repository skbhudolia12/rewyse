import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { PricingOutcome } from '@/types/domain';

/**
 * The pilot's measurements.
 *
 * One question sits above all the others: when a seller is shown a price scaled
 * to how close their move-out date is, do they take it? Every number here
 * either answers that or qualifies the answer.
 *
 * Aggregated in TypeScript over the raw rows rather than in SQL. The pilot is
 * hundreds of events, not millions, and a readable aggregation the team can
 * check by eye is worth more here than a fast one nobody can audit.
 */

export interface OutcomeBucket {
  outcome: PricingOutcome;
  label: string;
  count: number;
  share: number;
}

export interface DayBucket {
  label: string;
  total: number;
  accepted: number;
  rate: number;
}

export interface Insights {
  /** Suggestions that led to a published listing. */
  decided: number;
  acceptedSellFast: number;
  acceptanceRate: number;
  outcomes: OutcomeBucket[];
  byDays: DayBucket[];
  repricing: { runs: number; accepted: number; rate: number };
  offers: { total: number; countered: number; accepted: number; counterRate: number };
  engine: { llm: number; comparables: number; categoryDefault: number };
  medianGapFromSuggestion: number | null;
  sample: 'none' | 'thin' | 'usable';
  /** Rows written by seed:demo. Real results must not be quoted over these. */
  seeded: number;
}

const OUTCOME_LABELS: Record<PricingOutcome, string> = {
  accepted_sell_fast: 'Took the sell-fast price',
  within_range: 'Priced inside the fair range',
  below_range: 'Undercut their own suggestion',
  above_range: 'Priced above the fair range',
};

/**
 * Buckets chosen around the urgency curve, not round numbers: it floors on
 * move-out day and reaches its ceiling at 21, so the interesting movement is
 * inside the final week.
 */
const DAY_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '0–3 days', min: 0, max: 3 },
  { label: '4–7 days', min: 4, max: 7 },
  { label: '8–14 days', min: 8, max: 14 },
  { label: '15–21 days', min: 15, max: 21 },
  { label: '22+ days', min: 22, max: Number.POSITIVE_INFINITY },
];

/** Below this, percentages mislead more than they inform. */
const USABLE_SAMPLE = 20;
const THIN_SAMPLE = 5;

interface EventRow {
  prompt_version: string;
  outcome: PricingOutcome | null;
  days_until_moveout: number;
  is_repricing: boolean;
  base_value_source: string;
  sell_fast_price: number;
  final_asking_price: number | null;
}

export async function getInsights(): Promise<Insights> {
  const admin = createAdminClient();

  const [eventsRes, offersRes] = await Promise.all([
    admin
      .from('pricing_events')
      .select(
        'outcome, days_until_moveout, is_repricing, base_value_source, sell_fast_price, final_asking_price, prompt_version',
      ),
    admin.from('offers').select('status, counter_of'),
  ]);

  const events = (eventsRes.data ?? []) as EventRow[];
  const offers = offersRes.data ?? [];

  // A suggestion with no recorded asking price was shown but never acted on --
  // a seller mid-form. Counting those as rejections would understate
  // acceptance; counting them at all would answer a different question.
  const decidedEvents = events.filter((e) => e.outcome !== null);
  const decided = decidedEvents.length;

  const countBy = (outcome: PricingOutcome) =>
    decidedEvents.filter((e) => e.outcome === outcome).length;

  const outcomes: OutcomeBucket[] = (Object.keys(OUTCOME_LABELS) as PricingOutcome[]).map(
    (outcome) => {
      const count = countBy(outcome);
      return {
        outcome,
        label: OUTCOME_LABELS[outcome],
        count,
        share: decided > 0 ? count / decided : 0,
      };
    },
  );

  const acceptedSellFast = countBy('accepted_sell_fast');

  const byDays: DayBucket[] = DAY_BUCKETS.map((bucket) => {
    const inBucket = decidedEvents.filter(
      (e) => e.days_until_moveout >= bucket.min && e.days_until_moveout <= bucket.max,
    );
    const accepted = inBucket.filter((e) => e.outcome === 'accepted_sell_fast').length;
    return {
      label: bucket.label,
      total: inBucket.length,
      accepted,
      rate: inBucket.length > 0 ? accepted / inBucket.length : 0,
    };
  });

  const repriceRuns = decidedEvents.filter((e) => e.is_repricing);
  const repriceAccepted = repriceRuns.filter((e) => e.outcome === 'accepted_sell_fast').length;

  const countered = offers.filter((o) => o.status === 'countered').length;
  const acceptedOffers = offers.filter((o) => o.status === 'accepted').length;

  // How far a seller landed from the suggestion, as a share of it. Median
  // rather than mean: one seller pricing a laptop at ten times the suggestion
  // would drag an average somewhere meaningless.
  const gaps = decidedEvents
    .filter((e) => e.final_asking_price !== null && e.sell_fast_price > 0)
    .map((e) => (e.final_asking_price! - e.sell_fast_price) / e.sell_fast_price)
    .sort((a, b) => a - b);
  const medianGapFromSuggestion =
    gaps.length > 0 ? (gaps[Math.floor(gaps.length / 2)] ?? null) : null;

  return {
    decided,
    acceptedSellFast,
    acceptanceRate: decided > 0 ? acceptedSellFast / decided : 0,
    outcomes,
    byDays,
    repricing: {
      runs: repriceRuns.length,
      accepted: repriceAccepted,
      rate: repriceRuns.length > 0 ? repriceAccepted / repriceRuns.length : 0,
    },
    offers: {
      total: offers.length,
      countered,
      accepted: acceptedOffers,
      counterRate: offers.length > 0 ? countered / offers.length : 0,
    },
    engine: {
      llm: events.filter((e) => e.base_value_source === 'llm').length,
      comparables: events.filter((e) => e.base_value_source === 'comparables').length,
      categoryDefault: events.filter((e) => e.base_value_source === 'category_default').length,
    },
    medianGapFromSuggestion,
    seeded: decidedEvents.filter((e) => e.prompt_version === 'demo-seed').length,
    sample: decided === 0 ? 'none' : decided < THIN_SAMPLE ? 'thin' : decided < USABLE_SAMPLE ? 'thin' : 'usable',
  };
}
