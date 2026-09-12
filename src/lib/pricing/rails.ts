/**
 * Deterministic pricing rails.
 *
 * Everything in this file is a pure function. The LLM's only job upstream is to
 * estimate `baseValue`; the urgency curve, the condition multiplier, the clamps
 * and the rounding all live here, in code, under test.
 *
 * This split is the whole design. If the model owned the urgency math, two
 * identical listings three days from move-out could be quoted different prices,
 * the pilot's acceptance data would be noise, and nobody could explain to a
 * seller why their number moved. Prices have to be reproducible to be arguable.
 */

import type { FunctionalStatus, ListingCategory, PricingOutcome } from '@/types/domain';
import {
  CATEGORY_BOUNDS,
  CATEGORY_DEFAULT_BASE_VALUE,
  CONDITION_MULTIPLIERS,
  FAIR_MAX_RATIO,
  FAIR_MIN_RATIO,
  PRICE_ROUNDING_STEP,
  URGENCY_CEILING,
  URGENCY_FLOOR,
  URGENCY_WINDOW_DAYS,
} from './constants';

export interface PriceInputs {
  baseValue: number;
  functionalStatus: FunctionalStatus;
  daysUntilMoveout: number;
}

export interface PriceSuggestion {
  fairMin: number;
  fairMax: number;
  sellFastPrice: number;
  conditionMultiplier: number;
  urgencyFactor: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function roundToStep(value: number, step = PRICE_ROUNDING_STEP): number {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Whole days from `now` to the move-out date, floored at zero.
 *
 * The clock is a parameter rather than a call to `new Date()` so the curve is
 * testable at exact boundaries and never depends on when the suite runs.
 */
export function daysUntilMoveout(moveoutDate: string | Date, now: Date): number {
  const target = typeof moveoutDate === 'string' ? new Date(moveoutDate) : moveoutDate;
  if (Number.isNaN(target.getTime())) {
    throw new Error(`daysUntilMoveout: unparseable move-out date: ${String(moveoutDate)}`);
  }
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffMs = startOfDay(target) - startOfDay(now);
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

/**
 * Scales from 1.0 (a full window or more remaining) down to the floor as the
 * move-out date approaches. Floors rather than reaching zero: past a point,
 * further discounting stops being urgency and starts being a giveaway.
 */
export function urgencyFactor(days: number): number {
  const safeDays = Math.max(0, days);
  return clamp(safeDays / URGENCY_WINDOW_DAYS, URGENCY_FLOOR, URGENCY_CEILING);
}

export function conditionMultiplier(status: FunctionalStatus): number {
  return CONDITION_MULTIPLIERS[status];
}

/**
 * Constrains a base value to a plausible band for its category and falls back to
 * the category default when the input is absent or nonsensical. Any number
 * reaching the seller passes through here first.
 */
export function railBaseValue(value: number | null | undefined, category: ListingCategory): number {
  const bounds = CATEGORY_BOUNDS[category];
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return CATEGORY_DEFAULT_BASE_VALUE[category];
  }
  return Math.round(clamp(value, bounds.min, bounds.max));
}

/** Spec section 6, applied in order: condition, then band, then urgency. */
export function computeSuggestion(inputs: PriceInputs): PriceSuggestion {
  const multiplier = conditionMultiplier(inputs.functionalStatus);
  const factor = urgencyFactor(inputs.daysUntilMoveout);
  const adjusted = inputs.baseValue * multiplier;

  const fairMin = roundToStep(adjusted * FAIR_MIN_RATIO);
  const fairMax = roundToStep(adjusted * FAIR_MAX_RATIO);
  const sellFastPrice = roundToStep(adjusted * FAIR_MIN_RATIO * factor);

  return {
    fairMin,
    // Rounding can collapse the band on cheap items; keep it a real range.
    fairMax: Math.max(fairMax, fairMin + PRICE_ROUNDING_STEP),
    // The sell-fast number is a discount, so it must never exceed fairMin.
    sellFastPrice: Math.min(sellFastPrice, fairMin),
    conditionMultiplier: multiplier,
    urgencyFactor: factor,
  };
}

/**
 * Classifies what the seller actually did with the suggestion. This is the raw
 * measurement behind the pilot's central hypothesis, so the buckets are
 * deliberately mutually exclusive and exhaustive.
 */
export function classifyOutcome(
  askingPrice: number,
  suggestion: PriceSuggestion,
): PricingOutcome {
  if (askingPrice === suggestion.sellFastPrice) return 'accepted_sell_fast';
  if (askingPrice > suggestion.fairMax) return 'above_range';
  if (askingPrice >= suggestion.fairMin) return 'within_range';
  // Anything under fairMin that is not exactly the sell-fast number: the seller
  // discounted, but chose their own figure rather than taking the suggestion.
  return 'below_range';
}

/** Drives the "High Liquidity" badge in the create-listing flow. */
export function isHighLiquidity(askingPrice: number, suggestion: PriceSuggestion): boolean {
  return askingPrice <= suggestion.sellFastPrice;
}

/** Drives the "Fair Price" badge on a listing card. */
export function isWithinFairRange(askingPrice: number, suggestion: PriceSuggestion): boolean {
  return askingPrice >= suggestion.fairMin && askingPrice <= suggestion.fairMax;
}
