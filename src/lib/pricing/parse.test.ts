import { describe, expect, it } from 'vitest';
import {
  extractGeminiText,
  extractGroqText,
  normalizeTitle,
  parseEstimate,
  safeJson,
} from './parse';
import { railBaseValue } from './rails';

const POINTS = [
  'A 24-inch IPS panel from Dell retails near ₹11,000 new.',
  'Two to three years of use typically halves that on campus.',
];

const estimate = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    item_identified: 'Dell 24" IPS monitor',
    base_value_inr: 7500,
    confidence: 0.8,
    reasoning: POINTS,
    ...overrides,
  });

const validJson = estimate();

const geminiBody = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const groqBody = (content: string) => ({ choices: [{ message: { content } }] });

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeTitle('  Dell 24" IPS  Monitor!! ')).toBe('dell 24 ips monitor');
  });

  it('is stable for titles that differ only in punctuation, so they share a cache entry', () => {
    expect(normalizeTitle('Mini-Fridge (45L)')).toBe(normalizeTitle('mini fridge 45l'));
  });
});

describe('safeJson', () => {
  it('parses valid JSON', () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null rather than throwing on prose', () => {
    expect(safeJson('Sure! Here is my estimate:')).toBeNull();
  });
});

describe('extractGeminiText', () => {
  it('pulls the text part out', () => {
    expect(extractGeminiText(geminiBody(validJson))).toBe(validJson);
  });

  it.each([
    ['null body', null],
    ['empty object', {}],
    ['no candidates', { candidates: [] }],
    ['no parts', { candidates: [{ content: {} }] }],
    ['non-string text', { candidates: [{ content: { parts: [{ text: 42 }] } }] }],
    ['a safety block with no content', { candidates: [{ finishReason: 'SAFETY' }] }],
  ])('returns null for %s', (_label, body) => {
    expect(extractGeminiText(body)).toBeNull();
  });
});

describe('extractGroqText', () => {
  it('pulls the message content out', () => {
    expect(extractGroqText(groqBody(validJson))).toBe(validJson);
  });

  it.each([
    ['null body', null],
    ['no choices', { choices: [] }],
    ['no message', { choices: [{}] }],
    ['non-string content', { choices: [{ message: { content: { a: 1 } } }] }],
  ])('returns null for %s', (_label, body) => {
    expect(extractGroqText(body)).toBeNull();
  });
});

describe('parseEstimate', () => {
  it('accepts a well-formed estimate', () => {
    const result = parseEstimate(validJson);
    expect(result?.base_value_inr).toBe(7500);
    expect(result?.confidence).toBe(0.8);
  });

  it('returns null for null input', () => {
    expect(parseEstimate(null)).toBeNull();
  });

  /**
   * Each of these is a real way a model answer goes wrong. Any one reaching the
   * seller would show a nonsense price, so the boundary rejects rather than
   * coerces — the caller then falls back to comparables or a category default.
   */
  it.each([
    ['prose instead of JSON', 'I estimate around 7500 rupees.'],
    ['markdown-fenced JSON', '```json\n{"base_value_inr":7500}\n```'],
    ['missing the item', estimate({ item_identified: undefined })],
    ['a string price', estimate({ base_value_inr: '7500' })],
    ['a negative price', estimate({ base_value_inr: -500 })],
    ['zero', estimate({ base_value_inr: 0 })],
    ['confidence above 1', estimate({ confidence: 8 })],
    ['reasoning as one string', estimate({ reasoning: 'Sells around this.' })],
    ['a single reasoning point', estimate({ reasoning: [POINTS[0]] })],
    ['an empty reasoning point', estimate({ reasoning: [POINTS[0], ''] })],
    ['Infinity', '{"item_identified":"x y","base_value_inr":1e999,"confidence":0.8,"reasoning":[]}'],
    ['a JSON array', '[7500]'],
    ['empty string', ''],
  ])('rejects %s', (_label, text) => {
    expect(parseEstimate(text)).toBeNull();
  });

  it('rejects an over-long point rather than letting it into the UI', () => {
    expect(parseEstimate(estimate({ reasoning: [POINTS[0], 'x'.repeat(500)] }))).toBeNull();
  });

  it('rejects a look-alike glyph where the rupee sign belongs', () => {
    expect(parseEstimate(estimate({ reasoning: [POINTS[0], 'Retails new for around ‹3,000 in India.'] }))).toBeNull();
  });

  it('accepts the rupee sign, quotes and dashes', () => {
    const points = ['Retails new for about ₹14,000 — “a solid buy”.', "It's 2–3 years old, so 50% off is fair."];
    expect(parseEstimate(estimate({ reasoning: points }))?.reasoning).toEqual(points);
  });

  it('keeps the first four points when the model returns more', () => {
    const six = Array.from({ length: 6 }, (_, i) => `Reasoning point number ${i + 1}.`);
    expect(parseEstimate(estimate({ reasoning: six }))?.reasoning).toHaveLength(4);
  });

  it('trims whitespace around each point', () => {
    const parsed = parseEstimate(estimate({ reasoning: [`  ${POINTS[0]}  `, POINTS[1]] }));
    expect(parsed?.reasoning[0]).toBe(POINTS[0]);
  });
});

describe('parse and rails together', () => {
  it('clamps an order-of-magnitude hallucination that survives schema validation', () => {
    // Schema-valid, semantically absurd: 50 lakh for a textbook.
    const text = estimate({ base_value_inr: 5_000_000, confidence: 0.9 });
    const parsed = parseEstimate(text);
    expect(parsed).not.toBeNull();
    expect(railBaseValue(parsed!.base_value_inr, 'books')).toBe(5_000);
  });
});
