'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { removeListing, updateListing, type ListingActionState } from '@/lib/listings/actions';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
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

export interface EditableListing {
  id: string;
  title: string;
  category: ListingCategory;
  functional_status: FunctionalStatus;
  cosmetic_flaws: string | null;
  accessories_included: string | null;
  description: string | null;
  moveout_date: string;
  asking_price: number;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="flame" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

export function EditForm({ listing }: { listing: EditableListing }) {
  const [state, formAction] = useActionState<ListingActionState, FormData>(updateListing, {});
  const [removeState, removeAction] = useActionState<ListingActionState, FormData>(
    removeListing,
    {},
  );

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="listingId" value={listing.id} />

        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={listing.title} maxLength={120} required />
        </Field>

        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={listing.category}>
            {LISTING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Does it work?" htmlFor="functionalStatus">
          <Select
            id="functionalStatus"
            name="functionalStatus"
            defaultValue={listing.functional_status}
          >
            {(Object.keys(CONDITION_LABELS) as FunctionalStatus[]).map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Cosmetic condition" htmlFor="cosmeticFlaws" optional>
          <Input
            id="cosmeticFlaws"
            name="cosmeticFlaws"
            defaultValue={listing.cosmetic_flaws ?? ''}
            maxLength={200}
          />
        </Field>

        <Field label="What's included?" htmlFor="accessories" optional>
          <Input
            id="accessories"
            name="accessories"
            defaultValue={listing.accessories_included ?? ''}
            maxLength={200}
          />
        </Field>

        <Field
          label="Move-out date"
          htmlFor="moveoutDate"
          hint="Changing this changes what Smart Price suggests."
        >
          <Input
            id="moveoutDate"
            name="moveoutDate"
            type="date"
            defaultValue={listing.moveout_date}
            required
          />
        </Field>

        <Field label="Asking price" htmlFor="askingPrice">
          <Input
            id="askingPrice"
            name="askingPrice"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={listing.asking_price}
            required
          />
        </Field>

        <Field label="Description" htmlFor="description" optional>
          <Textarea
            id="description"
            name="description"
            defaultValue={listing.description ?? ''}
            maxLength={1200}
          />
        </Field>

        {state.error && <Alert tone="error">{state.error}</Alert>}
        <SaveButton />
      </form>

      <Card className="space-y-3">
        <p className="text-sm font-semibold">Take it off the market</p>
        <p className="text-paper-dim text-[13px] leading-relaxed">
          The listing stops appearing in the feed. Nothing is deleted — the pricing history stays,
          so the pilot keeps its data.
        </p>
        <form action={removeAction}>
          <input type="hidden" name="listingId" value={listing.id} />
          <Button type="submit" variant="danger" className="w-full">
            Remove listing
          </Button>
        </form>
        {removeState.error && <Alert tone="error">{removeState.error}</Alert>}
      </Card>
    </div>
  );
}
