import { describe, expect, it } from 'vitest';
import {
  extractGeminiText,
  extractGroqText,
  normalizeTitle,
  parseEstimate,
  safeJson,
} from './parse';
import { railBaseValue } from './rails';

const validJson = JSON.stringify({
  base_value_inr: 7500,
  confidence: 0.8,
  reasoning: 'A three-year-old 24-inch IPS panel sells around this on campus.',
});

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
    ['missing a field', '{"base_value_inr":7500,"confidence":0.8}'],
    ['a string price', '{"base_value_inr":"7500","confidence":0.8,"reasoning":"x"}'],
    ['a negative price', '{"base_value_inr":-500,"confidence":0.8,"reasoning":"x"}'],
    ['zero', '{"base_value_inr":0,"confidence":0.8,"reasoning":"x"}'],
    ['confidence above 1', '{"base_value_inr":7500,"confidence":8,"reasoning":"x"}'],
    ['an empty reasoning', '{"base_value_inr":7500,"confidence":0.8,"reasoning":""}'],
    ['Infinity', '{"base_value_inr":1e999,"confidence":0.8,"reasoning":"x"}'],
    ['a JSON array', '[7500]'],
    ['empty string', ''],
  ])('rejects %s', (_label, text) => {
    expect(parseEstimate(text)).toBeNull();
  });

  it('rejects an over-long reasoning rather than letting it into the UI', () => {
    const long = JSON.stringify({
      base_value_inr: 7500,
      confidence: 0.8,
      reasoning: 'x'.repeat(500),
    });
    expect(parseEstimate(long)).toBeNull();
  });
});

describe('parse and rails together', () => {
  it('clamps an order-of-magnitude hallucination that survives schema validation', () => {
    // Schema-valid, semantically absurd: 50 lakh for a textbook.
    const text = JSON.stringify({
      base_value_inr: 5_000_000,
      confidence: 0.9,
      reasoning: 'Rare edition.',
    });
    const parsed = parseEstimate(text);
    expect(parsed).not.toBeNull();
    expect(railBaseValue(parsed!.base_value_inr, 'books')).toBe(5_000);
  });
});
