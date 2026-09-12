import { describe, expect, it } from 'vitest';
import {
  classifyOutcome,
  computeSuggestion,
  conditionMultiplier,
  daysUntilMoveout,
  isHighLiquidity,
  isWithinFairRange,
  railBaseValue,
  urgencyFactor,
} from './rails';
import { CATEGORY_DEFAULT_BASE_VALUE, URGENCY_FLOOR } from './constants';

const suggest = (baseValue: number, days: number) =>
  computeSuggestion({ baseValue, functionalStatus: 'fully_working', daysUntilMoveout: days });

describe('daysUntilMoveout', () => {
  const now = new Date('2026-09-12T10:30:00Z');

  it('counts whole days ahead regardless of time of day', () => {
    expect(daysUntilMoveout('2026-09-19', now)).toBe(7);
  });

  it('returns zero on the move-out day itself', () => {
    expect(daysUntilMoveout('2026-09-12', now)).toBe(0);
  });

  it('floors at zero for dates already past', () => {
    expect(daysUntilMoveout('2026-09-01', now)).toBe(0);
  });

  it('throws on an unparseable date rather than silently pricing at zero days', () => {
    expect(() => daysUntilMoveout('not-a-date', now)).toThrow(/unparseable/);
  });
});

describe('urgencyFactor', () => {
  it('is at ceiling a full window or more before move-out', () => {
    expect(urgencyFactor(21)).toBe(1);
    expect(urgencyFactor(60)).toBe(1);
  });

  it('is at floor on the move-out day', () => {
    expect(urgencyFactor(0)).toBe(URGENCY_FLOOR);
  });

  it('interpolates in the upper part of the window', () => {
    expect(urgencyFactor(14)).toBeCloseTo(14 / 21, 5);
  });

  it('never returns a factor outside the floor/ceiling band', () => {
    for (const days of [-10, 0, 1, 5, 13, 21, 400]) {
      const factor = urgencyFactor(days);
      expect(factor).toBeGreaterThanOrEqual(URGENCY_FLOOR);
      expect(factor).toBeLessThanOrEqual(1);
    }
  });

  /**
   * KNOWN BEHAVIOUR of the spec's formula, pinned here deliberately.
   *
   * clamp(days / 21, 0.6, 1.0) reaches its floor at 12.6 days, so every listing
   * from 12 days out to the move-out day itself prices identically. That is the
   * exact window the product's pitch is about ("3 weeks out vs 3 days out"), so
   * this flat region is worth a decision rather than a discovery mid-pilot.
   */
  it('is flat across the final twelve days (spec formula, see comment)', () => {
    expect(urgencyFactor(12)).toBe(URGENCY_FLOOR);
    expect(urgencyFactor(3)).toBe(URGENCY_FLOOR);
    expect(urgencyFactor(0)).toBe(URGENCY_FLOOR);
  });
});

describe('conditionMultiplier', () => {
  it('discounts progressively by functional status', () => {
    expect(conditionMultiplier('fully_working')).toBe(1);
    expect(conditionMultiplier('partially_working')).toBeLessThan(
      conditionMultiplier('fully_working'),
    );
    expect(conditionMultiplier('for_parts')).toBeLessThan(
      conditionMultiplier('partially_working'),
    );
  });
});

describe('railBaseValue', () => {
  it('passes through a plausible value', () => {
    expect(railBaseValue(8000, 'electronics')).toBe(8000);
  });

  it('clamps an order-of-magnitude model hallucination to the category ceiling', () => {
    expect(railBaseValue(5_000_000, 'books')).toBe(5_000);
  });

  it('clamps an implausibly low value to the category floor', () => {
    expect(railBaseValue(2, 'furniture')).toBe(200);
  });

  it.each([null, undefined, Number.NaN, 0, -500])(
    'falls back to the category default for %s',
    (value) => {
      expect(railBaseValue(value, 'appliances')).toBe(CATEGORY_DEFAULT_BASE_VALUE.appliances);
    },
  );
});

describe('computeSuggestion', () => {
  it('brackets the fair range around the condition-adjusted base value', () => {
    const s = suggest(10_000, 21);
    expect(s.fairMin).toBe(8_500);
    expect(s.fairMax).toBe(10_500);
  });

  it('equals fairMin when a full window remains, so there is no phantom discount', () => {
    const s = suggest(10_000, 21);
    expect(s.sellFastPrice).toBe(s.fairMin);
  });

  it('discounts below fairMin as the move-out date approaches', () => {
    const far = suggest(10_000, 21);
    const near = suggest(10_000, 0);
    expect(near.sellFastPrice).toBeLessThan(far.sellFastPrice);
    expect(near.sellFastPrice).toBe(5_100);
  });

  it('applies the condition multiplier before the band', () => {
    const working = suggest(10_000, 21);
    const parts = computeSuggestion({
      baseValue: 10_000,
      functionalStatus: 'for_parts',
      daysUntilMoveout: 21,
    });
    expect(parts.fairMin).toBeLessThan(working.fairMin);
  });

  it('never lets the sell-fast price exceed fairMin', () => {
    for (const days of [0, 1, 7, 14, 21, 90]) {
      for (const base of [100, 750, 4_000, 90_000]) {
        const s = suggest(base, days);
        expect(s.sellFastPrice).toBeLessThanOrEqual(s.fairMin);
      }
    }
  });

  it('keeps the fair range from collapsing on cheap items after rounding', () => {
    const s = suggest(100, 21);
    expect(s.fairMax).toBeGreaterThan(s.fairMin);
  });

  it('rounds every surfaced price to a clean step', () => {
    const s = suggest(7_337, 9);
    for (const price of [s.fairMin, s.fairMax, s.sellFastPrice]) {
      expect(price % 50).toBe(0);
    }
  });

  it('is reproducible: identical inputs always yield identical output', () => {
    expect(suggest(12_345, 11)).toEqual(suggest(12_345, 11));
  });
});

describe('classifyOutcome', () => {
  const s = suggest(10_000, 0); // fairMin 8500, fairMax 10500, sellFast 5100

  it('records taking the sell-fast number exactly', () => {
    expect(classifyOutcome(s.sellFastPrice, s)).toBe('accepted_sell_fast');
  });

  it('records pricing above the fair range', () => {
    expect(classifyOutcome(12_000, s)).toBe('above_range');
  });

  it('records pricing inside the fair range', () => {
    expect(classifyOutcome(9_000, s)).toBe('within_range');
    expect(classifyOutcome(s.fairMin, s)).toBe('within_range');
    expect(classifyOutcome(s.fairMax, s)).toBe('within_range');
  });

  it('records a self-chosen discount between sell-fast and the fair range', () => {
    expect(classifyOutcome(6_500, s)).toBe('below_range');
  });

  it('records undercutting the sell-fast number', () => {
    expect(classifyOutcome(3_000, s)).toBe('below_range');
  });
});

describe('badges', () => {
  const s = suggest(10_000, 0);

  it('flags high liquidity at or under the sell-fast price', () => {
    expect(isHighLiquidity(s.sellFastPrice, s)).toBe(true);
    expect(isHighLiquidity(s.sellFastPrice - 100, s)).toBe(true);
    expect(isHighLiquidity(s.sellFastPrice + 100, s)).toBe(false);
  });

  it('flags fair price only inside the band', () => {
    expect(isWithinFairRange(s.fairMin, s)).toBe(true);
    expect(isWithinFairRange(s.fairMax, s)).toBe(true);
    expect(isWithinFairRange(s.fairMin - 50, s)).toBe(false);
    expect(isWithinFairRange(s.fairMax + 50, s)).toBe(false);
  });
});
