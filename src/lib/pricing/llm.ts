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

/**
 * One retry for a rate-limited or briefly unavailable model. The free tier's
 * per-minute cap clears within seconds, so a short wait usually turns a
 * category-default guess back into a real estimate. Only retried when the
 * first attempt failed fast, so a slow failure never doubles the wait.
 */
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const RETRY_BASE_MS = 1_200;
const RETRY_JITTER_MS = 800;
const RETRY_ONLY_IF_FAILED_WITHIN_MS = 3_000;

class ProviderError extends Error {
  constructor(
    readonly provider: EstimateSource,
    readonly status: number,
  ) {
    super(`${provider} ${status}`);
  }
}

export type EstimateSource = 'gemini' | 'groq';

export interface BaseValueEstimate {
  itemIdentified: string;
  baseValue: number;
  confidence: number;
  reasoning: string[];
  model: string;
  latencyMs: number;
}

/** A listing photo, already fetched from storage, for models that can see. */
export interface EstimatePhoto {
  mimeType: string;
  base64: string;
}

export interface EstimateInput {
  title: string;
  category: ListingCategory;
  functionalStatus: FunctionalStatus;
  cosmeticFlaws?: string | null;
  accessories?: string | null;
  description?: string | null;
  photo?: EstimatePhoto | null;
}

/**
 * Rules as explicit checks, because a vague prompt produces a vague number and
 * this one is shown to a student as a price.
 *
 * Deliberately asks for the value of a WORKING item: condition is applied
 * afterwards as a fixed multiplier, and letting the model discount for
 * condition too would apply the same penalty twice.
 *
 * The reasoning points are shown to the seller verbatim, so the prompt pins
 * their shape: what the item is, what it costs new, what resale does to that,
 * and what in the photo or notes moved the number.
 */
function buildPrompt(input: EstimateInput, withPhoto: boolean): string {
  // Absent fields are left out rather than listed as "none given": a model told
  // what is missing tends to say so back to the seller ("the lack of noted
  // flaws..."), which the eval caught on most items without notes.
  const hasDetails = Boolean(withPhoto || input.accessories || input.cosmeticFlaws || input.description);
  const pointC = hasDetails
    ? `    (c) the one detail that most affected your number: something in the ${withPhoto ? 'photo, ' : ''}wear, included items or description.`
    : '    (c) what campus buyers look for in this kind of item, and whether it resells quickly.';

  return [
    'You price second-hand items for a student marketplace on Indian university campuses (Delhi NCR).',
    '',
    'Estimate the BASE VALUE in INR of the item below. Work through these checks in order:',
    '',
    `1. Identify the item, and its brand, model or tier if the title${withPhoto ? ', photo' : ''} or notes show one.`,
    '2. Recall its approximate NEW retail price in India today.',
    '3. Apply realistic second-hand depreciation for a student resale, not a dealer price.',
    '4. Assume the item is FULLY WORKING. Do not discount for whether it works; that is applied separately.',
    '5. Do adjust for visible wear, missing parts or extras mentioned in the notes.',
    '6. Anchor to what one student would actually pay another, today, on campus.',
    '7. If the item cannot be identified, price the generic version of the category and set confidence below 0.4.',
    '',
    'Output rules:',
    '- item_identified: the item as a buyer would name it, e.g. "Dell 24-inch IPS monitor". Max 60 characters.',
    '- base_value_inr: a plain number. No symbol, no range.',
    '- confidence: 0 to 1.',
    '- reasoning: exactly 3 short sentences, each under 130 characters, addressed to the seller:',
    '    (a) what it is and roughly what it costs new;',
    '    (b) how age and campus resale affect that;',
    pointC,
    '  Talk about the item itself, never about what the seller did or did not write.',
    '  Plain language. Write money as one ₹ figure with Indian digit grouping, e.g. ₹14,000, never a range. No hedging,',
    '  no mention of these rules, no mention of move-out dates.',
    '- Be conservative. A price that is too high makes the listing sit unsold.',
    '',
    `Item title: ${input.title}`,
    `Category: ${input.category}`,
    ...(input.accessories ? [`Included: ${input.accessories}`] : []),
    ...(input.cosmeticFlaws ? [`Visible wear: ${input.cosmeticFlaws}`] : []),
    ...(input.description ? [`Seller's description: ${input.description}`] : []),
    ...(withPhoto ? ['A photo of the item is attached.'] : []),
  ].join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    item_identified: { type: 'STRING' },
    base_value_inr: { type: 'NUMBER' },
    confidence: { type: 'NUMBER' },
    reasoning: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['item_identified', 'base_value_inr', 'confidence', 'reasoning'],
  propertyOrdering: ['item_identified', 'base_value_inr', 'confidence', 'reasoning'],
} as const;

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
        contents: [
          {
            parts: [
              ...(input.photo
                ? [{ inlineData: { mimeType: input.photo.mimeType, data: input.photo.base64 } }]
                : []),
              { text: buildPrompt(input, Boolean(input.photo)) },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // Low but not zero: zero makes repeated quotes for near-identical
          // titles collapse onto odd fixed phrasings.
          temperature: 0.2,
          // Default thinking took ~5.7s per call and timed out under load;
          // "low" answers in ~1.3s and still reasons through the price.
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    },
  );

  if (!res.ok) throw new ProviderError('gemini', res.status);

  const body: unknown = await res.json();
  const parsed = parseEstimate(extractGeminiText(body));
  if (!parsed) return null;

  return {
    itemIdentified: parsed.item_identified,
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
            'Respond with JSON only: {"item_identified": string, "base_value_inr": number, "confidence": number between 0 and 1, "reasoning": array of exactly 3 strings}.',
        },
        { role: 'user', content: buildPrompt(input, false) },
      ],
    }),
  });

  if (!res.ok) throw new ProviderError('groq', res.status);

  const body: unknown = await res.json();
  const parsed = parseEstimate(extractGroqText(body));
  if (!parsed) return null;

  return {
    itemIdentified: parsed.item_identified,
    baseValue: parsed.base_value_inr,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    model: GROQ_MODEL,
    latencyMs: Date.now() - started,
  };
}

async function withOneRetry(
  call: () => Promise<BaseValueEstimate | null>,
): Promise<BaseValueEstimate | null> {
  const started = Date.now();
  try {
    return await call();
  } catch (err) {
    const retryable =
      err instanceof ProviderError &&
      RETRYABLE_STATUS.has(err.status) &&
      Date.now() - started < RETRY_ONLY_IF_FAILED_WITHIN_MS;
    if (!retryable) return null;
  }
  await new Promise((r) => setTimeout(r, RETRY_BASE_MS + Math.random() * RETRY_JITTER_MS));
  try {
    return await call();
  } catch {
    // Still unavailable; the caller falls through to the next provider.
    return null;
  }
}

/**
 * Tries Gemini (with one retry), then Groq, then gives up.
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
    const key = env.GEMINI_API_KEY;
    const result = await withOneRetry(() => callGemini(key, input));
    if (result) return { ...result, provider: 'gemini' };
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
