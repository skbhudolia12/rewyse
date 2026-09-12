'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import imageCompression from 'browser-image-compression';
import { Camera, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { completeSignup, type DetailsFormState } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

/**
 * Storage is capped at 1GB across the whole pilot, shared with every listing
 * photo. An uncompressed phone photo is 3-6MB, so compressing here is what keeps
 * the ID queue from eating the item photos' budget.
 */
const COMPRESSION = {
  maxSizeMB: 0.4,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg',
} as const;

type UploadState =
  | { status: 'idle' }
  | { status: 'working'; label: string }
  | { status: 'done'; path: string; preview: string }
  | { status: 'error'; message: string };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={disabled || pending}>
      {pending ? 'Submitting…' : 'Verify campus ID & continue'}
    </Button>
  );
}

export function DetailsForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<DetailsFormState, FormData>(completeSignup, {});
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      setUpload({ status: 'working', label: 'Compressing…' });
      const compressed = await imageCompression(file, COMPRESSION);

      setUpload({ status: 'working', label: 'Uploading…' });
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUpload({ status: 'error', message: 'Your session expired. Reload and sign in again.' });
        return;
      }

      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from('id-documents')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });

      if (error) {
        setUpload({ status: 'error', message: `Upload failed: ${error.message}` });
        return;
      }

      setUpload({ status: 'done', path, preview: URL.createObjectURL(compressed) });
    } catch (err) {
      setUpload({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not process that image.',
      });
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Full name" htmlFor="fullName">
        <Input id="fullName" name="fullName" autoComplete="name" required maxLength={80} />
      </Field>

      <Field label="College email" htmlFor="email" hint="Confirmed — this is the address you signed in with.">
        <Input id="email" value={email} disabled readOnly />
      </Field>

      <Field label="Hostel or hall of residence" htmlFor="hostel" optional>
        <Input id="hostel" name="hostel" maxLength={80} placeholder="e.g. Boys Hostel, Block C" />
      </Field>

      <Field
        label="When are you moving out?"
        htmlFor="moveoutDate"
        hint="This sets your suggested prices. You can change it per listing later."
      >
        <Input id="moveoutDate" name="moveoutDate" type="date" required />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">Student ID card</p>
        <p className="text-xs text-[var(--muted)]">
          Photograph your physical college ID. A reviewer checks it by hand, then the photo is
          deleted — we keep the decision, not the image.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <input type="hidden" name="documentPath" value={upload.status === 'done' ? upload.path : ''} />

        {upload.status === 'done' ? (
          <div className="border-verify-500/40 bg-verify-100/40 flex items-center gap-3 rounded-xl border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={upload.preview}
              alt="Your uploaded student ID"
              className="size-14 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-verify-700 flex items-center gap-1.5 text-sm font-medium">
                <CheckCircle2 className="size-4" /> ID uploaded
              </p>
              <button
                type="button"
                onClick={() => {
                  setUpload({ status: 'idle' });
                  fileInput.current?.click();
                }}
                className="text-xs text-[var(--muted)] underline"
              >
                Replace photo
              </button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={upload.status === 'working'}
            onClick={() => fileInput.current?.click()}
          >
            {upload.status === 'working' ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {upload.label}
              </>
            ) : (
              <>
                <Camera className="size-4" /> Take a photo of your ID
              </>
            )}
          </Button>
        )}

        {upload.status === 'error' && <Alert tone="error">{upload.message}</Alert>}
      </div>

      <div className="bg-brand-50 border-brand-200 flex gap-3 rounded-xl border p-3.5">
        <ShieldCheck className="text-brand-600 mt-0.5 size-5 shrink-0" />
        <p className="text-brand-900 text-sm">
          Only verified campus peers can message or buy. Your ID photo is visible to the ReWyse
          review team alone, and is deleted once your account is reviewed.
        </p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <SubmitButton disabled={upload.status !== 'done'} />
    </form>
  );
}
