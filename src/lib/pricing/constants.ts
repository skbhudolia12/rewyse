import type { ListingCategory, FunctionalStatus } from '@/types/domain';

/**
 * Bump whenever the LLM prompt changes. Every PricingEvent records it, so the
 * pilot's acceptance-rate data can be segmented before and after a tuning pass
 * instead of being silently blended into one misleading average.
 */
export const PROMPT_VERSION = 'v1';

/**
 * Functional condition is the only deterministic multiplier. Cosmetic flaws are
 * free text and are handed to the model as part of the base-value estimate --
 * there is no honest way to turn "minor scuffs on the base" into a number in
 * code, and pretending otherwise would put a fake precision on the output.
 */
export const CONDITION_MULTIPLIERS: Record<FunctionalStatus, number> = {
  fully_working: 1.0,
  partially_working: 0.6,
  for_parts: 0.3,
};

/**
 * Last-resort base values (INR) when there is no comparable row and the model is
 * unavailable. Deliberately conservative: a suggestion that is too low costs a
 * seller some rupees, one that is too high makes the whole feature look broken.
 */
export const CATEGORY_DEFAULT_BASE_VALUE: Record<ListingCategory, number> = {
  electronics: 4000,
  furniture: 2000,
  books: 300,
  appliances: 1500,
  other: 1000,
};

/**
 * Hard rails on any model-supplied base value (INR). These exist because an LLM
 * asked for a rupee figure will occasionally return a plausible-looking number
 * that is off by an order of magnitude, and an unclamped value flows straight
 * into a price shown to a real student.
 */
export const CATEGORY_BOUNDS: Record<ListingCategory, { min: number; max: number }> = {
  electronics: { min: 200, max: 150_000 },
  furniture: { min: 200, max: 40_000 },
  books: { min: 50, max: 5_000 },
  appliances: { min: 200, max: 60_000 },
  other: { min: 50, max: 50_000 },
};

/** Spec section 6. The band around a patient-sale price. */
export const FAIR_MIN_RATIO = 0.85;
export const FAIR_MAX_RATIO = 1.05;

/** Urgency ramps over this window; below the floor, discounting stops. */
export const URGENCY_WINDOW_DAYS = 21;
export const URGENCY_FLOOR = 0.6;
export const URGENCY_CEILING = 1.0;

/**
 * Decay constant for the urgency curve, in days.
 *
 * Smaller = the discount arrives later and bites harder in the final week.
 * At 7, a seller is near full price three weeks out, has given up about a third
 * of the discount by one week out, and reaches the floor on move-out day.
 */
export const URGENCY_DECAY_DAYS = 7;

/** Prices are surfaced rounded so they read as prices, not as float output. */
export const PRICE_ROUNDING_STEP = 50;

/** A listing is "Move-Out Clearance" inside this window. */
export const CLEARANCE_WINDOW_DAYS = 7;
