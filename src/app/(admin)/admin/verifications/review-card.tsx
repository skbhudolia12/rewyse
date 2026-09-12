'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { reviewIdDocument, type ReviewState } from './actions';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';

export interface PendingReview {
  id: string;
  submittedAt: string;
  fullName: string;
  email: string;
  campus: string;
  hostel: string | null;
  documentUrl: string | null;
}

function Actions({ onReject }: { onReject: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <Button
        type="submit"
        name="decision"
        value="approved"
        className="flex-1"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Approve'}
      </Button>
      <Button type="button" variant="danger" className="flex-1" onClick={onReject} disabled={pending}>
        Reject
      </Button>
    </div>
  );
}

export function ReviewCard({ review }: { review: PendingReview }) {
  const [state, formAction] = useActionState<ReviewState, FormData>(reviewIdDocument, {});
  const [rejecting, setRejecting] = useState(false);

  if (state.message) {
    return (
      <Card>
        <Alert tone="success">{state.message}</Alert>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{review.fullName}</p>
          <p className="truncate text-sm text-paper-dim">{review.email}</p>
          {review.hostel && <p className="truncate text-xs text-paper-dim">{review.hostel}</p>}
        </div>
        <Badge tone="neutral">{review.campus}</Badge>
      </div>

      {review.documentUrl ? (
        <a href={review.documentUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={review.documentUrl}
            alt={`Student ID submitted by ${review.fullName}`}
            className="border-hairline max-h-72 w-full rounded-xl border object-contain"
          />
          <span className="mt-1 block text-xs text-paper-dim">Tap to open full size</span>
        </a>
      ) : (
        <Alert tone="error">
          The uploaded file could not be loaded. Reject and ask the student to re-upload.
        </Alert>
      )}

      <p className="text-xs text-paper-dim">
        Check the name matches, the college is right, and the card looks like a real ID. This is
        screening, not forensics — when genuinely unsure, reject with a reason and ask again.
      </p>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="verificationId" value={review.id} />

        {rejecting ? (
          <div className="space-y-2">
            <Input
              name="reason"
              required
              maxLength={300}
              autoFocus
              placeholder="Reason, e.g. photo too blurry to read the name"
            />
            <div className="flex gap-2">
              <Button type="submit" name="decision" value="rejected" variant="danger" className="flex-1">
                Confirm rejection
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Actions onReject={() => setRejecting(true)} />
        )}

        {state.error && <Alert tone="error">{state.error}</Alert>}
      </form>
    </Card>
  );
}
