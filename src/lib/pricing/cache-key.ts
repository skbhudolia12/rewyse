import { createHash } from 'node:crypto';
import { normalizeTitle } from './parse';
import { PROMPT_VERSION } from './constants';
import type { ListingCategory } from '@/types/domain';

export interface ItemIdentity {
  category: ListingCategory;
  title: string;
  cosmeticFlaws?: string | null;
  accessories?: string | null;
  description?: string | null;
}

/**
 * price_cache key for an item.
 *
 * Deliberately excludes the move-out date and functional status: neither
 * reaches the model, so neither may fragment the cache. The photo is excluded
 * too: it sharpens a first estimate, but the item's identity is what the
 * seller wrote, and a re-taken photo of the same item must not cost a new call.
 *
 * Its own module so the pricing eval can compute the exact key the app will
 * look up when it freezes reviewed answers for the demo.
 */
export function cacheKey(item: ItemIdentity): string {
  return createHash('sha256')
    .update(
      [
        item.category,
        normalizeTitle(item.title),
        (item.cosmeticFlaws ?? '').trim().toLowerCase(),
        (item.accessories ?? '').trim().toLowerCase(),
        (item.description ?? '').trim().toLowerCase(),
        PROMPT_VERSION,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);
}
