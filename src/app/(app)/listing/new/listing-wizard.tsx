'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import imageCompression from 'browser-image-compression';
import { Camera, Check, ImagePlus, Loader2, Play, Sparkles, Video, X } from 'lucide-react';
import { createListingAction, quoteAction, type ListingFormState } from './actions';
import type { Quote } from '@/lib/pricing/service';
import { Alert, Button, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { CATEGORY_LABELS } from '@/lib/listings/categories';
import { cn, formatINR } from '@/lib/utils';
import { LISTING_CATEGORIES, type ListingCategory, type FunctionalStatus } from '@/types/domain';

const FORM_ID = 'listing-form';

const CONDITION_LABELS: Record<FunctionalStatus, string> = {
  fully_working: 'Fully working',
  partially_working: 'Partly working',
  for_parts: 'For parts',
};

/** 1GB of storage is shared across every listing. */
const PHOTO_COMPRESSION = {
  maxSizeMB: 0.3,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg',
} as const;

const MAX_PHOTOS = 5;
const MAX_VIDEO_SECONDS = 20;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const VIDEO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** Long enough for the seller to stop typing, short enough to feel live. */
const QUOTE_DEBOUNCE_MS = 800;

/** What the price check is doing, shown while the first answer is on its way. */
const THINKING_STEPS = [
  'Looking at your photo',
  'Comparing campus resale prices',
  'Adjusting for your move-out date',
];
const THINKING_STEP_MS = 1100;

interface MediaItem {
  path: string;
  kind: 'photo' | 'video';
  isLiveCapture: boolean;
  preview: string;
  seconds?: number;
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(el.duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That video could not be read. Try an MP4.'));
    };
    el.src = url;
  });
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user?.id ?? null;
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
  const videoInput = useRef<HTMLInputElement>(null);

  const photos = media.filter((m) => m.kind === 'photo');
  const video = media.find((m) => m.kind === 'video');
  const firstPhotoPath = photos[0]?.path;
  const hasLiveCapture = photos.some((m) => m.isLiveCapture);
  // The photo comes first so the model sees the item before its answer is
  // cached; a quote run on the title alone would never be revisited.
  const canQuote = title.trim().length >= 2 && moveout !== '' && firstPhotoPath !== undefined;

  // Read inside the effect without re-running it: once the seller types their
  // own price, a later quote must not overwrite it, but typing a price is not a
  // reason to re-quote.
  const askTouchedRef = useRef(false);
  useEffect(() => {
    askTouchedRef.current = askTouched;
  }, [askTouched]);

  // Debounced so typing does not spend one model call per keystroke. Changing
  // only the date is served from cache by the backend.
  useEffect(() => {
    if (!canQuote) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuoting(true);
      setQuoteError(null);
      const result = await quoteAction({
        title: title.trim(),
        category,
        functionalStatus: condition,
        cosmeticFlaws: cosmetic.trim() || undefined,
        accessories: accessories.trim() || undefined,
        description: description.trim() || undefined,
        photoPath: firstPhotoPath,
        moveoutDate: moveout,
      });
      if (cancelled) return;
      setQuoting(false);
      if (result.ok) {
        setQuote(result.quote);
        if (!askTouchedRef.current) setAsk(String(result.quote.sellFastPrice));
      } else {
        setQuoteError(result.error);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canQuote, title, category, condition, cosmetic, accessories, description, firstPhotoPath, moveout]);

  async function handlePhoto(files: FileList | null, isLiveCapture: boolean) {
    const file = files?.[0];
    if (!file) return;
    if (photos.length >= MAX_PHOTOS) {
      setUploadError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setUploadError(null);
    setUploading('Compressing photo');
    try {
      const compressed = await imageCompression(file, PHOTO_COMPRESSION);
      setUploading('Uploading photo');
      const uid = await currentUserId();
      if (!uid) {
        setUploadError('Your session expired. Reload the page and sign in again.');
        return;
      }
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error } = await createClient()
        .storage.from('listing-media')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        setUploadError(`The photo didn't upload: ${error.message}`);
        return;
      }
      setMedia((prev) => [
        ...prev,
        { path, kind: 'photo', isLiveCapture, preview: URL.createObjectURL(compressed) },
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'That image could not be processed.');
    } finally {
      setUploading(null);
    }
  }

  async function handleVideo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadError(null);

    if (!VIDEO_TYPES.includes(file.type)) {
      setUploadError('Use an MP4, WebM or MOV video.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError('That video is over 10 MB. Record a shorter clip.');
      return;
    }

    setUploading('Checking video');
    try {
      const seconds = await readVideoDuration(file);
      if (seconds > MAX_VIDEO_SECONDS + 0.5) {
        setUploadError(`Keep the video under ${MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(seconds)}.`);
        return;
      }
      setUploading('Uploading video');
      const uid = await currentUserId();
      if (!uid) {
        setUploadError('Your session expired. Reload the page and sign in again.');
        return;
      }
      const path = `${uid}/${crypto.randomUUID()}.${VIDEO_EXT[file.type] ?? 'mp4'}`;
      const { error } = await createClient()
        .storage.from('listing-media')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setUploadError(`The video didn't upload: ${error.message}`);
        return;
      }
      setMedia((prev) => [
        ...prev.filter((m) => m.kind !== 'video'),
        { path, kind: 'video', isLiveCapture: false, preview: URL.createObjectURL(file), seconds },
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'That video could not be processed.');
    } finally {
      setUploading(null);
    }
  }

  // Photos first, video last: the first photo is the cover in the feed.
  const ordered = [...photos, ...(video ? [video] : [])];
  const payload = JSON.stringify({
    title: title.trim(),
    category,
    functionalStatus: condition,
    cosmeticFlaws: cosmetic.trim() || undefined,
    accessories: accessories.trim() || undefined,
    description: description.trim() || undefined,
    moveoutDate: moveout,
    askingPrice: Number(ask || 0),
    media: ordered.map(({ path, kind, isLiveCapture }) => ({ path, kind, isLiveCapture })),
  });

  const askNumber = Number(ask || 0);
  const blocker = !photos.length
    ? 'Add a photo to get a price.'
    : !hasLiveCapture
      ? 'Take at least one photo with the camera to publish.'
      : !quote
        ? 'Waiting for the price check.'
        : askNumber <= 0
          ? 'Set an asking price to publish.'
          : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-10">
      <form id={FORM_ID} action={formAction} className="space-y-6">
        <input type="hidden" name="payload" value={payload} />

        <Section n={1} title="Photos and video" done={hasLiveCapture}>
          <p className="text-paper-dim text-sm leading-relaxed">
            Take at least one photo with your camera here, so buyers know the item is really
            yours. A short video of it working puts your listing above photo-only ones.
          </p>

          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void handlePhoto(e.target.files, true);
              e.target.value = '';
            }}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void handlePhoto(e.target.files, false);
              e.target.value = '';
            }}
          />
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void handleVideo(e.target.files);
              e.target.value = '';
            }}
          />

          {ordered.length > 0 && (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {ordered.map((m, i) => (
                <li
                  key={m.path}
                  className="bg-ink-elevated border-hairline relative aspect-square overflow-hidden rounded-lg border"
                >
                  {m.kind === 'photo' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.preview} alt="" className="size-full object-cover" />
                  ) : (
                    <video src={m.preview} muted playsInline className="size-full object-cover" />
                  )}
                  <span className="absolute inset-x-1.5 bottom-1.5 flex flex-wrap gap-1">
                    {i === 0 && m.kind === 'photo' && <Tag>Cover</Tag>}
                    {m.isLiveCapture && <Tag>Taken in app</Tag>}
                    {m.kind === 'video' && (
                      <Tag>
                        <Play className="size-2.5 fill-current" />
                        {Math.round(m.seconds ?? 0)}s
                      </Tag>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMedia((prev) => prev.filter((x) => x.path !== m.path))}
                    aria-label={m.kind === 'video' ? 'Remove video' : `Remove photo ${i + 1}`}
                    className="bg-ink/80 text-paper hover:bg-ink absolute top-1.5 right-1.5 rounded-full p-1.5"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={hasLiveCapture ? 'secondary' : 'primary'}
              onClick={() => cameraInput.current?.click()}
              disabled={uploading !== null || photos.length >= MAX_PHOTOS}
            >
              <Camera className="size-4" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => galleryInput.current?.click()}
              disabled={uploading !== null || photos.length >= MAX_PHOTOS}
            >
              <ImagePlus className="size-4" />
              Upload photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => videoInput.current?.click()}
              disabled={uploading !== null}
            >
              <Video className="size-4" />
              {video ? 'Replace video' : 'Add video'}
            </Button>
          </div>

          {uploading && (
            <p className="text-paper-dim flex items-center gap-2 text-sm" role="status">
              <Loader2 className="size-4 animate-spin" />
              {uploading}
            </p>
          )}
          {uploadError && <Alert tone="error">{uploadError}</Alert>}
          {photos.length > 0 && !hasLiveCapture && (
            <Alert tone="info">
              These photos came from your gallery. Take one with the camera to publish.
            </Alert>
          )}
        </Section>

        <Section n={2} title="About the item" done={title.trim().length >= 2}>
          <Field label="Title" htmlFor="title" hint="Include the brand and model if it has one.">
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Dell 24" IPS monitor'
              maxLength={120}
              required
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
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

            <Field label="Does it work?">
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Does it work?">
                {(Object.keys(CONDITION_LABELS) as FunctionalStatus[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    aria-pressed={condition === c}
                    className={cn(
                      'min-h-12 rounded-lg border px-2 text-[13px] transition',
                      condition === c
                        ? 'bg-paper text-ink border-paper font-semibold'
                        : 'border-hairline-strong text-paper-dim hover:text-paper hover:border-paper-faint',
                    )}
                  >
                    {CONDITION_LABELS[c]}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Visible wear" htmlFor="cosmetic" optional>
              <Input
                id="cosmetic"
                value={cosmetic}
                onChange={(e) => setCosmetic(e.target.value)}
                placeholder="Minor scuffs on the base"
                maxLength={200}
              />
            </Field>
            <Field label="What's included" htmlFor="accessories" optional>
              <Input
                id="accessories"
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                placeholder="Power cable and HDMI cable"
                maxLength={200}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="description" optional>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1200}
              placeholder="How long you've had it, why you're selling, and anything the photos don't show."
            />
          </Field>
        </Section>

        <Section n={3} title="Move-out date" done={moveout !== ''}>
          <Field
            label="When are you vacating your room?"
            htmlFor="moveout"
            hint="The closer it is, the lower the quick-sale price, so the item goes before you do."
          >
            <Input
              id="moveout"
              type="date"
              value={moveout}
              onChange={(e) => setMoveout(e.target.value)}
              className="sm:max-w-xs"
              required
            />
          </Field>
        </Section>
      </form>

      <aside className="lg:sticky lg:top-32 lg:h-fit">
        <PricePanel
          quote={quote}
          quoting={quoting}
          error={quoteError}
          canQuote={canQuote}
          hasPhoto={photos.length > 0}
          ask={ask}
          onAsk={(v) => {
            setAsk(v);
            setAskTouched(true);
          }}
          onPick={(v) => {
            setAsk(String(v));
            setAskTouched(true);
          }}
          blocker={blocker}
          formError={state.error}
        />
      </aside>
    </div>
  );
}

function Section({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-hairline bg-ink-raised space-y-5 rounded-xl border p-5 md:p-6">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
            done ? 'bg-verify text-ink' : 'border-hairline-strong text-paper-dim border',
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-ink/85 text-paper inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
      {children}
    </span>
  );
}

function PublishButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      form={FORM_ID}
      variant="flame"
      size="lg"
      className="w-full"
      disabled={disabled || pending}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Publishing
        </>
      ) : (
        'Publish listing'
      )}
    </Button>
  );
}

function ThinkingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => Math.min(s + 1, THINKING_STEPS.length - 1)),
      THINKING_STEP_MS,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <ul className="space-y-2.5">
        {THINKING_STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              'flex items-center gap-2.5 text-sm transition-colors',
              i < step ? 'text-paper-dim' : i === step ? 'text-paper' : 'text-paper-faint',
            )}
          >
            {i < step ? (
              <Check className="text-verify size-4" />
            ) : i === step ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span className="border-hairline-strong size-4 rounded-full border" />
            )}
            {label}
          </li>
        ))}
      </ul>
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
      </div>
    </div>
  );
}

function PricePanel({
  quote,
  quoting,
  error,
  canQuote,
  hasPhoto,
  ask,
  onAsk,
  onPick,
  blocker,
  formError,
}: {
  quote: Quote | null;
  quoting: boolean;
  error: string | null;
  canQuote: boolean;
  hasPhoto: boolean;
  ask: string;
  onAsk: (v: string) => void;
  onPick: (v: number) => void;
  blocker: string | null;
  formError: string | undefined;
}) {
  const days = quote?.daysUntilMoveout ?? null;
  const urgent = days !== null && days <= 7;
  const askNumber = Number(ask || 0);
  const highLiquidity = quote !== null && askNumber > 0 && askNumber <= quote.sellFastPrice;

  return (
    <div className="border-hairline-strong bg-ink-raised overflow-hidden rounded-xl border">
      <div className="border-hairline flex items-center justify-between border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="text-flame-bright size-4" />
          Price check
        </h2>
        {quoting && quote && <Loader2 className="text-paper-dim size-4 animate-spin" />}
      </div>

      <div className="space-y-6 p-5">
        {!canQuote && !quote && (
          <p className="text-paper-dim text-sm leading-relaxed">
            {hasPhoto
              ? 'Add a title and the price check will look at your item.'
              : 'Add a photo and a title. The price check looks at both, then works out what to charge before your move-out.'}
          </p>
        )}

        {canQuote && !quote && !error && <ThinkingState />}

        {error && <Alert tone="error">{error}</Alert>}

        {quote && (
          <div className={cn('space-y-6 transition-opacity', quoting && 'opacity-60')}>
            <div>
              {quote.itemIdentified && (
                <p className="text-paper-dim text-sm">
                  Looks like <span className="text-paper font-medium">{quote.itemIdentified}</span>
                </p>
              )}
              <p className="text-paper-dim mt-3 text-[13px]">Fair price range</p>
              <p className="mt-0.5 text-[28px] font-semibold tracking-tight">
                {formatINR(quote.fairMin)} – {formatINR(quote.fairMax)}
              </p>
              <ul className="mt-3 space-y-2">
                {quote.reasoning.map((point) => (
                  <li key={point} className="text-paper-dim flex gap-2.5 text-[13px] leading-relaxed">
                    <span className="bg-paper-faint mt-2 size-1 shrink-0 rounded-full" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              {quote.lowConfidence && (
                <p className="text-flame-amber mt-3 text-[13px] leading-relaxed">
                  Add the brand or model to the title for a sharper estimate.
                </p>
              )}
            </div>

            <div
              className={cn(
                'rounded-lg border p-4',
                urgent ? 'border-flame-edge bg-flame-soft' : 'border-hairline bg-surface',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">Quick-sale price</p>
                <p className={cn('text-xs font-medium', urgent ? 'text-flame-bright' : 'text-paper-dim')}>
                  {days === 0 ? 'Moving out today' : `${days} ${days === 1 ? 'day' : 'days'} to move-out`}
                </p>
              </div>
              <p
                className={cn(
                  'mt-1 text-[34px] font-semibold tracking-tight',
                  urgent && 'text-flame-bright',
                )}
              >
                {formatINR(quote.sellFastPrice)}
              </p>
              <ul className="mt-2 space-y-1.5">
                {quote.urgencyNotes.map((line) => (
                  <li key={line} className="text-paper-dim text-[13px] leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <Field label="Your asking price" htmlFor="ask">
                <div className="relative">
                  <span className="text-paper-dim pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">
                    ₹
                  </span>
                  <Input
                    id="ask"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={ask}
                    onChange={(e) => onAsk(e.target.value)}
                    className="pl-8 text-lg font-semibold"
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <PriceOption
                  label="Quick sale"
                  value={quote.sellFastPrice}
                  active={askNumber === quote.sellFastPrice}
                  onClick={() => onPick(quote.sellFastPrice)}
                />
                <PriceOption
                  label="Fair price"
                  value={quote.fairMin}
                  active={askNumber === quote.fairMin}
                  onClick={() => onPick(quote.fairMin)}
                />
              </div>
              {highLiquidity && (
                <p className="text-verify flex items-center gap-1.5 text-[13px] font-medium">
                  <Check className="size-4" />
                  Priced to sell before you move out
                </p>
              )}
            </div>

            <details className="border-hairline border-t pt-4">
              <summary className="text-paper-dim hover:text-paper cursor-pointer text-[13px]">
                How this was calculated
              </summary>
              <dl className="text-paper-dim mt-3 space-y-1.5 text-[13px]">
                <Row label="Estimated value" value={formatINR(quote.baseValue)} />
                <Row label="Condition" value={`×${quote.conditionMultiplier.toFixed(2)}`} />
                <Row label="Fair range" value="85% – 105% of value" />
                <Row label="Move-out adjustment" value={`×${quote.urgencyFactor.toFixed(2)}`} />
              </dl>
            </details>
          </div>
        )}

        <div className="border-hairline space-y-2.5 border-t pt-5">
          {formError && <Alert tone="error">{formError}</Alert>}
          <PublishButton disabled={blocker !== null} />
          <p className="text-paper-faint text-center text-xs">
            {blocker ?? 'You can edit or remove the listing any time.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function PriceOption({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-14 rounded-lg border px-3 py-2 text-left transition',
        active
          ? 'border-paper bg-surface'
          : 'border-hairline-strong hover:border-paper-faint',
      )}
    >
      <span className="text-paper-dim block text-xs">{label}</span>
      <span className="block text-sm font-semibold">{formatINR(value)}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-paper">{value}</dd>
    </div>
  );
}
