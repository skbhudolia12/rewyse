import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, Button, Card, PageHeader } from '@/components/ui';
import { requireProfile } from '@/lib/auth/session';

/**
 * The waiting room between gate A and gate B.
 *
 * Shown rather than a blank screen because an unexplained dead end is how a
 * pilot loses the students it just recruited. The stated turnaround is a
 * promise someone on the team has to keep -- change this copy the moment it
 * stops being true.
 */
export default async function VerifyPage() {
  const profile = await requireProfile();
  if (profile.verified_status === 'verified') redirect('/home');

  const rejected = profile.verified_status === 'rejected';

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-10 pb-safe">
      {rejected ? (
        <div className="space-y-6">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <ShieldAlert className="size-7" />
          </span>
          <PageHeader
            title="We could not verify your ID"
            subtitle="A reviewer could not confirm your student ID from the photo you sent."
          />
          <Alert tone="error" title="What to do next">
            Email the ReWyse team from your college address and we will take another look. This is
            usually a blurry or cropped photo rather than anything wrong with your account.
          </Alert>
        </div>
      ) : (
        <div className="space-y-6">
          <span className="bg-flame-soft text-flame-bright flex size-14 items-center justify-center rounded-2xl">
            <Clock className="size-7" />
          </span>
          <PageHeader
            title="Verification pending"
            subtitle="Your student ID is with a reviewer. This is usually done within 24 hours."
          />
          <Card className="space-y-4">
            <Step done label="College email confirmed" detail={profile.email} />
            <Step
              done={false}
              label="Student ID review"
              detail="A person checks your ID by hand, then the photo is deleted."
            />
          </Card>
          <p className="text-sm text-paper-dim">
            You can browse once you are verified. Until then, listing, messaging and offers are
            switched off for everyone who has not cleared both checks — including you.
          </p>
        </div>
      )}

      <div className="mt-auto pt-10">
        <Link href="/" className="block">
          <Button variant="secondary" size="lg" className="w-full">
            Back to home
          </Button>
        </Link>
      </div>
    </main>
  );
}

function Step({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span
        className={
          done
            ? 'bg-verify-soft text-verify flex size-8 shrink-0 items-center justify-center rounded-full'
            : 'bg-ink-raised flex size-8 shrink-0 items-center justify-center rounded-full text-paper-dim'
        }
      >
        {done ? <ShieldCheck className="size-4" /> : <Clock className="size-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-paper-dim">{detail}</p>
      </div>
    </div>
  );
}
