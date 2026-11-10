/**
 * Delivery promise shown before purchase.
 *
 * Same-campus orders go out next day; cross-campus ones take a day longer
 * because the partner batches inter-campus runs. Kept here, not in a
 * component, so the card, the buy box and checkout always quote the same day.
 */

const SAME_CAMPUS_DAYS = 1;
const CROSS_CAMPUS_DAYS = 2;

export function deliveryEta(now: Date, sameCampus: boolean): Date {
  const eta = new Date(now);
  eta.setDate(eta.getDate() + (sameCampus ? SAME_CAMPUS_DAYS : CROSS_CAMPUS_DAYS));
  return eta;
}

/** "Thu, 13 Nov" in Indian English. */
export function formatEta(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}
