import { z } from 'zod';

/**
 * Parsing and validation for model responses.
 *
 * Split out from llm.ts so it is testable without a network call. This is the
 * boundary where an untrusted, non-deterministic response becomes a number the
 * app will show a student as a price — everything here fails closed, returning
 * null rather than a guess.
 */

/** One reasoning point, as shown to a seller. Long enough for a clause, short enough to scan. */
export const MAX_POINT_LENGTH = 160;
export const MIN_POINTS = 2;
export const MAX_POINTS = 4;

/**
 * Letters, digits, ordinary punctuation and the rupee sign. A model will now
 * and then emit a look-alike glyph where ₹ belongs (seen in eval: "‹3,000"),
 * and that reaches a seller verbatim, so an answer containing one is rejected.
 */
const READABLE = /^[\p{L}\p{N}\s.,;:!?'"’‘“”()\-–—%/&+₹]+$/u;

const point = z
  .string()
  .trim()
  .min(8)
  .max(MAX_POINT_LENGTH)
  .regex(READABLE, 'reasoning contains an unexpected character');

export const estimateSchema = z.object({
  item_identified: z.string().trim().min(2).max(80),
  base_value_inr: z.number().finite().positive(),
  confidence: z.number().min(0).max(1),
  // A model sometimes returns one more point than asked; keep the first four
  // rather than discarding an otherwise good answer.
  reasoning: z
    .array(point)
    .min(MIN_POINTS)
    .transform((points) => points.slice(0, MAX_POINTS)),
});

export type Estimate = z.infer<typeof estimateSchema>;

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Pulls the text part out of a Gemini generateContent response. */
export function extractGeminiText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const text = (parts[0] as { text?: unknown })?.text;
  return typeof text === 'string' ? text : null;
}

/** Pulls the message content out of a Groq chat-completions response. */
export function extractGroqText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const content = (choices[0] as { message?: { content?: unknown } })?.message?.content;
  return typeof content === 'string' ? content : null;
}

/**
 * Full response -> validated estimate, or null.
 *
 * One funnel for both providers so a malformed answer from either is rejected
 * identically, rather than one provider having a quieter failure mode.
 */
export function parseEstimate(text: string | null): Estimate | null {
  if (!text) return null;
  const parsed = estimateSchema.safeParse(safeJson(text));
  return parsed.success ? parsed.data : null;
}

/** Normalizes a listing title for comparable matching and cache keys. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
