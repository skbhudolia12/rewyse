'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

export function EnterButton({ label, primary }: { label: string; primary: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={primary ? 'flame' : 'secondary'}
      className="w-full"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Signing in
        </>
      ) : (
        `Continue as ${label.toLowerCase()}`
      )}
    </Button>
  );
}
