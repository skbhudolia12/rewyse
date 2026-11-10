/**
 * ReWyse's revenue rules: what a buyer pays on top of the item, and what a
 * seller pays to boost a listing.
 *
 * Pure functions, so the buy box, the checkout and the server all quote the
 * same number. The server recomputes on every checkout; a total that arrives
 * from the browser is never trusted.
 *
 * The seller always receives the full item price. ReWyse earns from the
 * buyer's convenience and delivery fees and from optional seller boosts.
 */

import type { ListingCategory } from '@/types/domain';

/** Convenience fee brackets, by item price in INR. Cheaper items carry a higher rate. */
export const CONVENIENCE_BRACKETS = [
  { below: 1000, rate: 0.05 },
  { below: 5000, rate: 0.04 },
  { below: Number.POSITIVE_INFINITY, rate: 0.03 },
] as const;
export const CONVENIENCE_MIN = 15;
export const CONVENIENCE_MAX = 299;

export const DELIVERY_SAME_CAMPUS = 39;
export const DELIVERY_CROSS_CAMPUS = 79;
/** Furniture and appliances need a larger vehicle and two hands. */
export const DELIVERY_BULKY_SURCHARGE = 60;
const BULKY: ReadonlySet<ListingCategory> = new Set(['furniture', 'appliances']);

export const BOOST_PLANS = {
  boost_3d: { label: '3 days', days: 3, price: 29 },
  boost_7d: { label: '7 days', days: 7, price: 49 },
} as const;
export type BoostPlan = keyof typeof BOOST_PLANS;

export function convenienceRate(itemAmount: number): number {
  return CONVENIENCE_BRACKETS.find((b) => itemAmount < b.below)!.rate;
}

export function convenienceFee(itemAmount: number): number {
  if (!Number.isFinite(itemAmount) || itemAmount <= 0) {
    throw new Error(`convenienceFee: item amount must be positive, got ${itemAmount}`);
  }
  const raw = Math.round(itemAmount * convenienceRate(itemAmount));
  return Math.min(CONVENIENCE_MAX, Math.max(CONVENIENCE_MIN, raw));
}

export function deliveryFee(opts: { sameCampus: boolean; category: ListingCategory }): number {
  const base = opts.sameCampus ? DELIVERY_SAME_CAMPUS : DELIVERY_CROSS_CAMPUS;
  return base + (BULKY.has(opts.category) ? DELIVERY_BULKY_SURCHARGE : 0);
}

export interface OrderTotals {
  itemAmount: number;
  convenienceFee: number;
  deliveryFee: number;
  total: number;
}

export function orderTotals(opts: {
  itemAmount: number;
  sameCampus: boolean;
  category: ListingCategory;
}): OrderTotals {
  const convenience = convenienceFee(opts.itemAmount);
  const delivery = deliveryFee(opts);
  return {
    itemAmount: opts.itemAmount,
    convenienceFee: convenience,
    deliveryFee: delivery,
    total: opts.itemAmount + convenience + delivery,
  };
}
