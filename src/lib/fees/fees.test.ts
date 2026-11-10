import { describe, expect, it } from 'vitest';
import {
  CONVENIENCE_MAX,
  CONVENIENCE_MIN,
  convenienceFee,
  convenienceRate,
  deliveryFee,
  orderTotals,
} from './index';

describe('convenienceRate', () => {
  it.each([
    [999, 0.05],
    [1000, 0.04],
    [4999, 0.04],
    [5000, 0.03],
    [80_000, 0.03],
  ])('charges the right bracket at ₹%i', (amount, rate) => {
    expect(convenienceRate(amount)).toBe(rate);
  });
});

describe('convenienceFee', () => {
  it('applies the bracket rate and rounds to whole rupees', () => {
    expect(convenienceFee(3750)).toBe(150);
    expect(convenienceFee(999)).toBe(50);
  });

  it('never charges less than the minimum on cheap items', () => {
    expect(convenienceFee(100)).toBe(CONVENIENCE_MIN);
  });

  it('caps the fee on expensive items', () => {
    expect(convenienceFee(50_000)).toBe(CONVENIENCE_MAX);
  });

  it('rejects a zero or negative amount rather than charging a fee on nothing', () => {
    expect(() => convenienceFee(0)).toThrow();
    expect(() => convenienceFee(-10)).toThrow();
  });
});

describe('deliveryFee', () => {
  it('is cheaper on the same campus than across campuses', () => {
    expect(deliveryFee({ sameCampus: true, category: 'electronics' })).toBe(39);
    expect(deliveryFee({ sameCampus: false, category: 'electronics' })).toBe(79);
  });

  it('adds the bulky surcharge for furniture and appliances only', () => {
    expect(deliveryFee({ sameCampus: true, category: 'furniture' })).toBe(99);
    expect(deliveryFee({ sameCampus: false, category: 'appliances' })).toBe(139);
    expect(deliveryFee({ sameCampus: true, category: 'books' })).toBe(39);
  });
});

describe('orderTotals', () => {
  it('sums item, convenience and delivery into the total the buyer pays', () => {
    const t = orderTotals({ itemAmount: 3750, sameCampus: false, category: 'electronics' });
    expect(t).toEqual({ itemAmount: 3750, convenienceFee: 150, deliveryFee: 79, total: 3979 });
  });
});
