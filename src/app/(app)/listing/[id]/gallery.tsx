'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GalleryItem {
  id: string;
  kind: 'photo' | 'video';
  url: string | null;
}

/**
 * The verification video leads when there is one: it is the strongest
 * evidence the item exists and works, so a buyer sees it before the photos.
 */
export function Gallery({ items, title }: { items: GalleryItem[]; title: string }) {
  const ordered = [...items.filter((i) => i.kind === 'video'), ...items.filter((i) => i.kind === 'photo')];
  const [activeId, setActiveId] = useState(ordered[0]?.id);
  const active = ordered.find((i) => i.id === activeId) ?? ordered[0];

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {ordered.length > 1 && (
        <ul className="scrollbar-none flex gap-2 overflow-x-auto md:w-16 md:flex-col md:overflow-visible">
          {ordered.map((item, i) => (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActiveId(item.id)}
                aria-label={item.kind === 'video' ? 'Show video' : `Show photo ${i + 1}`}
                aria-pressed={item.id === active?.id}
                className={cn(
                  'bg-ink-elevated relative block size-16 overflow-hidden rounded-lg border-2 transition',
                  item.id === active?.id ? 'border-paper' : 'hover:border-hairline-strong border-transparent',
                )}
              >
                {item.url &&
                  (item.kind === 'video' ? (
                    <video src={item.url} muted preload="metadata" className="size-full object-cover" />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.url} alt="" className="size-full object-cover" />
                  ))}
                {item.kind === 'video' && (
                  <span className="bg-ink/40 absolute inset-0 flex items-center justify-center">
                    <Play className="text-paper size-5 fill-current" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-ink-elevated flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-xl">
        {active?.url ? (
          active.kind === 'video' ? (
            <video
              key={active.id}
              src={active.url}
              controls
              playsInline
              className="size-full object-contain"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={active.url} alt={title} className="size-full object-contain" />
          )
        ) : (
          <p className="text-paper-faint text-sm">No photo</p>
        )}
      </div>
    </div>
  );
}
