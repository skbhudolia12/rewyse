import 'server-only';
import { serverEnv } from '@/lib/env';
import { extractGeminiText, extractGroqText, parseEstimate } from './parse';
import { PROMPT_VERSION } from './constants';
import type { FunctionalStatus, ListingCategory } from '@/types/domain';

/**
 * Base-value estimation.
 *
 * The model answers exactly one question: what is this item roughly worth,
 * second-hand, on an Indian campus today. It is never asked for the final price
 * -- the urgency curve, the condition multiplier and the category clamps are
 * deterministic code in rails.ts, under test.
 *
 * Treated as what it is: a non-deterministic, rate-limited, untrusted
 * dependency. Every response is schema-validated, every call is bounded by a
 * timeout, and there is always a deterministic answer behind it.
 */

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/** Long enough for a cold model, short enough that a seller does not give up. */
const TIMEOUT_MS = 8_000;

export type EstimateSource = 'gemini' | 'groq';

export interface BaseValueEstimate {
  baseValue: number;
  confidence: number;
  reasoning: string;
  model: string;
  latencyMs: number;
}

export interface EstimateInput {
  title: string;
  category: ListingCategory;
  functionalStatus: FunctionalStatus;
  cosmeticFlaws?: string | null;
  accessories?: string | null;
}

/**
 * Rules as explicit checks, because a vague prompt produces a vague number and
 * this one is shown to a student as a price.
 *
 * Deliberately asks for the value of a WORKING item: condition is applied
 * afterwards as a fixed multiplier, and letting the model discount for
 * condition too would apply the same penalty twice.
 */
function buildPrompt(input: EstimateInput): string {
  return [
    'You price second-hand items for a student marketplace on Indian university campuses (Delhi NCR).',
    '',
    'Estimate the BASE VALUE in INR of the item below. Work through these checks in order:',
    '',
    '1. Identify the item, and its model or tier if the title names one.',
    '2. Recall its approximate NEW retail price in India.',
    '3. Apply realistic second-hand depreciation for a student resale, not a dealer price.',
    '4. Assume the item is FULLY WORKING. Do not discount for condition — that is applied separately.',
    '5. Anchor to what one student would actually pay another in cash, today, on campus.',
    '6. If the title is too vague to identify, price the generic version of that category and set confidence below 0.4.',
    '',
    'Constraints:',
    '- Output INR, a plain number, no currency symbol, no ranges.',
    '- Be conservative. A price that is too high makes the listing sit unsold and the feature look broken.',
    '- reasoning: one short sentence a student would find convincing. No hedging, no restating these rules.',
    '',
    `Item title: ${input.title}`,
    `Category: ${input.category}`,
    input.accessories ? `Included: ${input.accessories}` : 'Included: not specified',
    input.cosmeticFlaws ? `Cosmetic notes: ${input.cosmeticFlaws}` : 'Cosmetic notes: none given',
  ].join('\n');
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  apiKey: string,
  input: EstimateInput,
): Promise<BaseValueEstimate | null> {
  const started = Date.now();
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              base_value_inr: { type: 'NUMBER' },
              confidence: { type: 'NUMBER' },
              reasoning: { type: 'STRING' },
            },
            required: ['base_value_inr', 'confidence', 'reasoning'],
          },
          temperature: 0.2,
        },
      }),
    },
  );

  if (!res.ok) throw new Error(`gemini ${res.status}`);

  const body: unknown = await res.json();
  const parsed = parseEstimate(extractGeminiText(body));
  if (!parsed) return null;

  return {
    baseValue: parsed.base_value_inr,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    model: GEMINI_MODEL,
    latencyMs: Date.now() - started,
  };
}

async function callGroq(apiKey: string, input: EstimateInput): Promise<BaseValueEstimate | null> {
  const started = Date.now();
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Respond with JSON only: {"base_value_inr": number, "confidence": number between 0 and 1, "reasoning": string under 240 characters}.',
        },
        { role: 'user', content: buildPrompt(input) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`groq ${res.status}`);

  const body: unknown = await res.json();
  const parsed = parseEstimate(extractGroqText(body));
  if (!parsed) return null;

  return {
    baseValue: parsed.base_value_inr,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    model: GROQ_MODEL,
    latencyMs: Date.now() - started,
  };
}

/**
 * Tries Gemini, then Groq, then gives up.
 *
 * Returns null rather than throwing: an unavailable model is an expected state
 * on a free tier, not an exception. The caller falls back to comparables and
 * then to a category default, so the seller always gets a number.
 */
export async function estimateBaseValue(
  input: EstimateInput,
): Promise<(BaseValueEstimate & { provider: EstimateSource }) | null> {
  const env = serverEnv();

  if (env.GEMINI_API_KEY) {
    try {
      const result = await callGemini(env.GEMINI_API_KEY, input);
      if (result) return { ...result, provider: 'gemini' };
    } catch {
      // Rate limit, timeout or transient failure -- fall through to Groq.
    }
  }

  if (env.GROQ_API_KEY) {
    try {
      const result = await callGroq(env.GROQ_API_KEY, input);
      if (result) return { ...result, provider: 'groq' };
    } catch {
      // Both providers unavailable; the deterministic fallback takes over.
    }
  }

  return null;
}

export { PROMPT_VERSION };
