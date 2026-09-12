'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import imageCompression from 'browser-image-compression';
import { Camera, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { createListingAction, quoteAction, type ListingFormState } from './actions';
import type { Quote } from '@/lib/pricing/service';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { formatINR } from '@/lib/utils';
import { LISTING_CATEGORIES, type ListingCategory, type FunctionalStatus } from '@/types/domain';

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  electronics: 'Electronics',
  furniture: 'Room furniture',
  books: 'Study & books',
  appliances: 'Appliances',
  other: 'Something else',
};

const CONDITION_LABELS: Record<FunctionalStatus, string> = {
  fully_working: 'Fully working',
  partially_working: 'Partly working',
  for_parts: 'For parts',
};

/** 1GB of storage is shared across every listing in the pilot. */
const PHOTO_COMPRESSION = {
  maxSizeMB: 0.3,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg',
} as const;

const MAX_PHOTOS = 5;
/** Long enough for the seller to stop typing, short enough to feel live. */
const QUOTE_DEBOUNCE_MS = 800;

interface MediaItem {
  path: string;
  kind: 'photo' | 'video';
  isLiveCapture: boolean;
  preview: string;
}

function PublishButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="flame" size="lg" className="w-full" disabled={disabled || pending}>
      {pending ? 'Publishing…' : 'Review & publish listing'}
    </Button>
  );
}

export function ListingWizard({ defaultMoveout }: { defaultMoveout: string }) {
  const [state, formAction] = useActionState<ListingFormState, FormData>(createListingAction, {});

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ListingCategory>('electronics');
  const [condition, setCondition] = useState<FunctionalStatus>('fully_working');
  const [cosmetic, setCosmetic] = useState('');
  const [accessories, setAccessories] = useState('');
  const [description, setDescription] = useState('');
  const [moveout, setMoveout] = useState(defaultMoveout);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [ask, setAsk] = useState('');
  const [askTouched, setAskTouched] = useState(false);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const hasLiveCapture = media.some((m) => m.kind === 'photo' && m.isLiveCapture);
  const canQuote = title.trim().length >= 2 && moveout !== '';

  const runQuote = useCallback(async () => {
    setQuoting(true);
    setQuoteError(null);
    const result = await quoteAction({
      title: title.trim(),
      category,
      functionalStatus: condition,
      cosmeticFlaws: cosmetic.trim() || undefined,
      accessories: accessories.trim() || undefined,
      moveoutDate: moveout,
    });
    setQuoting(false);
    if (result.ok) {
      setQuote(result.quote);
      if (!askTouched) setAsk(String(result.quote.sellFastPrice));
    } else {
      setQuoteError(result.error);
    }
  }, [title, category, condition, cosmetic, accessories, moveout, askTouched]);

  // Debounced so a seller typing a title does not spend one model call per
  // keystroke. Changing only the date is served from cache by the backend.
  useEffect(() => {
    if (!canQuote) return;
    const timer = setTimeout(() => void runQuote(), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [canQuote, runQuote]);

  async function handleFiles(files: FileList | null, isLiveCapture: boolean) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    if (media.length >= MAX_PHOTOS) {
      setUploadError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setUploadError(null);
    setUploading(isLiveCapture ? 'Compressing photo…' : 'Compressing…');

    try {
      const compressed = await imageCompression(file, PHOTO_COMPRESSION);
      setUploading('Uploading…');

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUploadError('Your session expired. Reload and sign in again.');
        return;
      }

      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from('listing-media')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });

      if (error) {
        setUploadError(`Upload failed: ${error.message}`);
        return;
      }

      setMedia((prev) => [
        ...prev,
        { path, kind: 'photo', isLiveCapture, preview: URL.createObjectURL(compressed) },
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not process that image.');
    } finally {
      setUploading(null);
    }
  }

  const payload = JSON.stringify({
    title: title.trim(),
    category,
    functionalStatus: condition,
    cosmeticFlaws: cosmetic.trim() || undefined,
    accessories: accessories.trim() || undefined,
    description: description.trim() || undefined,
    moveoutDate: moveout,
    askingPrice: Number(ask || 0),
    media: media.map(({ path, kind, isLiveCapture }) => ({ path, kind, isLiveCapture })),
  });

  const askNumber = Number(ask || 0);
  const highLiquidity = quote ? askNumber <= quote.sellFastPrice : false;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,26rem)]">
      <form action={formAction} className="space-y-10">
        <input type="hidden" name="payload" value={payload} />

        <section className="space-y-6">
          <StepHeading n="01" title="What are you selling?" />

          <Field label="Title" htmlFor="title" hint="What you'd call it if a friend asked.">
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. Dell 24" IPS monitor'
              maxLength={120}
              required
            />
          </Field>

          <Field label="Category" htmlFor="category">
            <Select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ListingCategory)}
            >
              {LISTING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Photos</p>
            <p className="text-paper-dim text-[13px] leading-relaxed">
              At least one has to be taken here, now, with your camera. It&rsquo;s the difference
              between a real listing and a stock photo someone copied.
            </p>

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void handleFiles(e.target.files, true)}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void handleFiles(e.target.files, false)}
            />

            <div className="grid grid-cols-3 gap-3 pt-1 sm:grid-cols-5">
              {media.map((m, i) => (
                <div
                  key={m.path}
                  className="border-hairline-strong relative aspect-square overflow-hidden rounded-xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.preview} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                  {m.isLiveCapture && (
                    <span className="bg-flame text-ink absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold">
                      LIVE
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setMedia((prev) => prev.filter((x) => x.path !== m.path))}
                    aria-label={`Remove photo ${i + 1}`}
                    className="bg-ink/80 text-paper absolute top-1 right-1 rounded-full p-1"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}

              {media.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  disabled={uploading !== null}
                  className="border-hairline-strong text-paper-dim hover:border-flame hover:text-flame flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed transition"
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="size-5" />
                      <span className="text-[10px] font-semibold">Camera</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {media.length > 0 && media.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => galleryInput.current?.click()}
                className="text-paper-dim hover:text-paper inline-flex items-center gap-2 pt-1 text-xs underline"
              >
                <ImagePlus className="size-3.5" />
                Add one from your gallery too
              </button>
            )}

            {uploading && <p className="text-paper-dim text-xs">{uploading}</p>}
            {uploadError && <Alert tone="error">{uploadError}</Alert>}
            {media.length > 0 && !hasLiveCapture && (
              <Alert tone="error">
                None of these were taken in the app. Add at least one camera photo to publish.
              </Alert>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <StepHeading n="02" title="Condition & timing" />

          <Field label="Does it work?" htmlFor="condition">
            <div className="grid grid-cols-3 gap-2.5">
              {(Object.keys(CONDITION_LABELS) as FunctionalStatus[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCondition(c)}
                  aria-pressed={condition === c}
                  className={`min-h-12 rounded-xl border px-3 text-sm transition ${
                    condition === c
                      ? 'bg-paper text-ink border-paper font-semibold'
                      : 'border-hairline-strong text-paper-dim hover:border-paper hover:text-paper'
                  }`}
                >
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Cosmetic condition" htmlFor="cosmetic" optional hint="Scuffs, dents, anything visible.">
            <Input
              id="cosmetic"
              value={cosmetic}
              onChange={(e) => setCosmetic(e.target.value)}
              placeholder="e.g. minor scuffs on the base"
              maxLength={200}
            />
          </Field>

          <Field label="What's included?" htmlFor="accessories" optional>
            <Input
              id="accessories"
              value={accessories}
              onChange={(e) => setAccessories(e.target.value)}
              placeholder="e.g. charger + HDMI cable"
              maxLength={200}
            />
          </Field>

          <Field
            label="When are you vacating your room?"
            htmlFor="moveout"
            hint="This is the lever. Everything in the price panel moves with it."
          >
            <Input
              id="moveout"
              type="date"
              value={moveout}
              onChange={(e) => setMoveout(e.target.value)}
              required
            />
          </Field>

          <Field label="Anything else a buyer should know?" htmlFor="description" optional>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1200}
              placeholder="How long you've had it, why you're selling, anything that isn't obvious from the photos."
            />
          </Field>
        </section>

        <section className="space-y-4">
          <StepHeading n="03" title="Publish" />
          {state.error && <Alert tone="error">{state.error}</Alert>}
          <PublishButton disabled={!hasLiveCapture || !quote || askNumber <= 0} />
          <p className="text-paper-faint text-center text-xs">
            You can edit or remove this listing any time.
          </p>
        </section>
      </form>

      <aside className="lg:sticky lg:top-6 lg:h-fit">
        <PricePanel
          quote={quote}
          quoting={quoting}
          error={quoteError}
          canQuote={canQuote}
          ask={ask}
          onAsk={(v) => {
            setAsk(v);
            setAskTouched(true);
          }}
          onUseSellFast={() => {
            if (quote) {
              setAsk(String(quote.sellFastPrice));
              setAskTouched(true);
            }
          }}
          onUseFair={() => {
            if (quote) {
              setAsk(String(quote.fairMin));
              setAskTouched(true);
            }
          }}
          highLiquidity={highLiquidity}
        />
      </aside>
    </div>
  );
}

function StepHeading({ n, title }: { n: string; title: string }) {
  return (
    <div className="border-hairline flex items-baseline gap-3 border-b pb-3">
      <span className="font-display text-flame text-xs tracking-[0.14em]">{n}</span>
      <h2 className="font-display text-2xl">{title}</h2>
    </div>
  );
}

function PricePanel({
  quote,
  quoting,
  error,
  canQuote,
  ask,
  onAsk,
  onUseSellFast,
  onUseFair,
  highLiquidity,
}: {
  quote: Quote | null;
  quoting: boolean;
  error: string | null;
  canQuote: boolean;
  ask: string;
  onAsk: (v: string) => void;
  onUseSellFast: () => void;
  onUseFair: () => void;
  highLiquidity: boolean;
}) {
  const days = quote?.daysUntilMoveout ?? null;
  const critical = days !== null && days <= 3;
  const soon = days !== null && days <= 10;

  return (
    <div className="border-hairline-strong bg-surface space-y-6 rounded-2xl border p-6">
      <div className="flex items-center justify-between">
        <span className="bg-flame-soft text-flame-bright inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em]">
          <Sparkles className="size-3" />
          SMART PRICE
        </span>
        {quoting && <Loader2 className="text-paper-dim size-4 animate-spin" />}
      </div>

      {!canQuote && (
        <p className="text-paper-dim text-sm leading-relaxed">
          Add a title and your move-out date, and a suggested price appears here.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {quote && (
        <>
          <div>
            <p className="text-paper-dim text-xs font-semibold tracking-[0.14em] uppercase">
              Fair market range
            </p>
            <p className="font-display mt-2 text-3xl">
              {formatINR(quote.fairMin)} – {formatINR(quote.fairMax)}
            </p>
            <p className="text-paper-dim mt-2 text-[13px] leading-relaxed">{quote.reasoning}</p>
          </div>

          <div
            className={`rounded-xl border p-5 transition ${
              critical ? 'border-flame-edge bg-flame-soft' : 'border-hairline bg-surface'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-paper-dim text-xs font-semibold tracking-[0.14em] uppercase">
                Sell before move-out
              </span>
              <span
                className={`text-[11px] font-semibold ${critical ? 'text-flame' : soon ? 'text-flame-amber' : 'text-paper-dim'}`}
              >
                {days} {days === 1 ? 'day' : 'days'} away
              </span>
            </div>
            <p
              className={`font-display mt-3 text-5xl ${critical ? 'text-flame' : soon ? 'text-flame-amber' : 'text-paper'}`}
            >
              {formatINR(quote.sellFastPrice)}
            </p>
            <p className="text-paper-dim mt-2 text-[13px]">
              {critical
                ? 'Priced to go today. Expect messages within hours.'
                : soon
                  ? 'Estimated sale within 48 hours.'
                  : 'You have room to hold out for the fair range.'}
            </p>
          </div>

          <div className="space-y-3">
            <Field label="Your asking price" htmlFor="ask">
              <Input
                id="ask"
                type="number"
                inputMode="numeric"
                min={0}
                value={ask}
                onChange={(e) => onAsk(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={onUseSellFast}>
                Sell-fast price
              </Button>
              <Button type="button" variant="secondary" onClick={onUseFair}>
                Fair range
              </Button>
            </div>
            {highLiquidity && <Badge tone="flame">High liquidity — sells fastest</Badge>}
          </div>

          {quote.estimated && (
            <Alert tone="info">
              This is a category estimate — our pricing model was unavailable. Adjust it if you
              know the item&rsquo;s real value.
            </Alert>
          )}

          <details className="border-hairline border-t pt-4">
            <summary className="text-paper-dim cursor-pointer text-[13px]">
              How we got this number
            </summary>
            <dl className="text-paper-dim mt-3 space-y-1.5 text-[13px]">
              <Row label="Base value" value={formatINR(quote.baseValue)} />
              <Row label="Source" value={quote.baseValueSource.replace('_', ' ')} />
              <Row label="Condition" value={`×${quote.conditionMultiplier.toFixed(2)}`} />
              <Row label={`Urgency (${days}d)`} value={`×${quote.urgencyFactor.toFixed(2)}`} />
            </dl>
          </details>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="text-paper">{value}</dd>
    </div>
  );
}
