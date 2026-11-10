/**
 * Live eval of the pricing model against a golden set.
 *
 *   npm run eval:pricing
 *
 * Makes real model calls (about 15 per run, paced over ~2 minutes), so
 * it is NOT part of `npm test`. Run it after any prompt or model change, and
 * before recording a demo. It passes only if every answer parses, names the
 * item, gives 2-4 reasoning points, and lands inside its band.
 *
 * Side effect: writes every passing answer to demo-assets/model-answers.json.
 * `npm run seed:demo` freezes the demo items into price_cache and uses the rest
 * for the seeded feed. Read that file before seeding; it is what appears on camera.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { GOLDEN_ITEMS, type GoldenItem } from './golden-items';
import { cacheKey } from '@/lib/pricing/cache-key';
import { railBaseValue } from '@/lib/pricing/rails';
import type { BaseValueEstimate, EstimatePhoto } from '@/lib/pricing/llm';

const OUT_DIR = 'demo-assets';
const OUT_FILE = `${OUT_DIR}/model-answers.json`;
const PHOTO_DIR = `${OUT_DIR}/golden`;
/** Reasoning that talks about the seller's text rather than the item reads as filler. */
const META_COMMENTARY =
  /\b(lack of|absence of|no (specific|noted|mentioned)|not (mentioned|specified)|unspecified|without (any )?(specific|noted)|description|details? (are|is) missing)\b/i;
const PRICE_RANGE = /₹\s?[\d,]+\s?(to|-|–)\s?₹?\s?[\d,]+/;

/** Keeps a full run under the free tier's per-minute cap (about 10 requests, measured). */
const PACE_MS = 7_000;

// serverEnv() reads process.env, so the file has to be loaded before the
// provider module is imported.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq > 0) process.env[t.slice(0, eq).trim()] ??= t.slice(eq + 1).trim();
}

let estimateBaseValue: typeof import('@/lib/pricing/llm').estimateBaseValue;
/**
 * Answers are merged by slug into the existing file, so re-running one item
 * (`npm run eval:pricing -- -t kindle`) refreshes it without dropping the rest.
 * Items no longer in the golden set are pruned.
 */
const slugs = new Set(GOLDEN_ITEMS.map((i) => i.slug));
const frozen = new Map<string, Record<string, unknown>>(
  existsSync(OUT_FILE)
    ? (JSON.parse(readFileSync(OUT_FILE, 'utf8')) as Array<Record<string, unknown>>)
        .filter((a) => slugs.has(a.slug as string))
        .map((a) => [a.slug as string, a])
    : [],
);

function photoFor(item: GoldenItem): EstimatePhoto | null {
  const path = `${PHOTO_DIR}/${item.slug}.jpg`;
  if (!existsSync(path)) return null;
  return { mimeType: 'image/jpeg', base64: readFileSync(path).toString('base64') };
}

beforeAll(async () => {
  ({ estimateBaseValue } = await import('@/lib/pricing/llm'));
});

describe('pricing model golden set', () => {
  for (const item of GOLDEN_ITEMS) {
    it(`${item.slug}: lands in ₹${item.band[0]}–${item.band[1]}`, async () => {
      if (item !== GOLDEN_ITEMS[0]) await new Promise((r) => setTimeout(r, PACE_MS));
      const result = (await estimateBaseValue({
        title: item.title,
        category: item.category,
        functionalStatus: 'fully_working',
        cosmeticFlaws: item.cosmeticFlaws ?? null,
        accessories: item.accessories ?? null,
        description: item.description ?? null,
        photo: photoFor(item),
      })) as (BaseValueEstimate & { provider: string }) | null;

      expect(result, 'no provider answered with a valid response').not.toBeNull();
      const r = result!;
      const railed = railBaseValue(r.baseValue, item.category);

      console.log(
        `\n${item.slug} [${r.provider}] ₹${railed} (conf ${r.confidence})\n  ${r.itemIdentified}\n  - ${r.reasoning.join('\n  - ')}`,
      );

      expect(r.itemIdentified.length).toBeGreaterThan(2);
      expect(r.reasoning.length).toBeGreaterThanOrEqual(2);
      expect(r.reasoning.length).toBeLessThanOrEqual(4);
      // Quality gate: the points are shown to sellers verbatim.
      for (const point of r.reasoning) {
        expect(point, 'comments on the listing text instead of the item').not.toMatch(META_COMMENTARY);
        expect(point, 'quotes a price range').not.toMatch(PRICE_RANGE);
      }
      expect(railed).toBeGreaterThanOrEqual(item.band[0]);
      expect(railed).toBeLessThanOrEqual(item.band[1]);

      {
        frozen.set(item.slug, {
          slug: item.slug,
          demo: item.demo ?? false,
          cache_key: cacheKey(item),
          base_value: railed,
          model_used: r.model,
          confidence: r.confidence,
          reasoning: JSON.stringify({ item: r.itemIdentified, points: r.reasoning }),
          fields: {
            category: item.category,
            title: item.title,
            cosmeticFlaws: item.cosmeticFlaws ?? '',
            accessories: item.accessories ?? '',
            description: item.description ?? '',
          },
        });
        mkdirSync(OUT_DIR, { recursive: true });
        const ordered = GOLDEN_ITEMS.flatMap((i) => (frozen.has(i.slug) ? [frozen.get(i.slug)!] : []));
        writeFileSync(OUT_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
      }
    });
  }
});
