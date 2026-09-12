'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MailCheck } from 'lucide-react';
import { requestSignInLink, type AuthFormState } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Sending…' : label}
    </Button>
  );
}

export function SignInForm({
  submitLabel,
  domainHint,
}: {
  submitLabel: string;
  domainHint: string;
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(requestSignInLink, {});

  if (state.sentTo) {
    return (
      <div className="space-y-4">
        <div className="bg-flame-soft text-flame-bright flex size-14 items-center justify-center rounded-2xl">
          <MailCheck className="size-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold">Check your inbox</h2>
          <p className="text-sm text-paper-dim">
            We sent a sign-in link to <span className="text-paper">{state.sentTo}</span>
            . Open it on this device to continue.
          </p>
        </div>
        <Alert tone="info">
          The link expires in an hour. If it does not arrive, check spam — college mail servers
          are aggressive about filtering.
        </Alert>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <Field
        label="College email"
        htmlFor="email"
        hint={`Use your address ending in ${domainHint}`}
        error={state.error}
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@iiitd.ac.in"
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <SubmitButton label={submitLabel} />
      <p className="text-center text-xs text-paper-dim">
        We will email you a link. No password to remember.
      </p>
    </form>
  );
}
