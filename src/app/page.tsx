import Link from 'next/link';
import { ShieldCheck, Tag, MapPin } from 'lucide-react';
import { Button } from '@/components/ui';
import { getUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
  // A signed-in student has no reason to read the pitch again.
  if (await getUser()) redirect('/home');

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-14 pb-safe">
      <div className="flex-1">
        <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">ReWyse</p>
        <h1 className="mt-3 text-4xl leading-tight font-semibold tracking-tight">
          Moving out?
          <br />
          Sell it to someone
          <br />
          <span className="text-brand-600">on your campus.</span>
        </h1>
        <p className="mt-4 text-base text-[var(--muted)]">
          A marketplace for verified students across IIIT Delhi, IIT Delhi and DTU. Fair prices
          that account for how close you are to move-out day.
        </p>

        <ul className="mt-10 space-y-5">
          <Feature
            icon={<Tag className="size-5" />}
            title="Prices that know your deadline"
            body="Get a suggested price based on the item's condition and how many days you have left."
          />
          <Feature
            icon={<ShieldCheck className="size-5" />}
            title="Verified students only"
            body="College email and a student ID check. No outsiders, no anonymous accounts."
          />
          <Feature
            icon={<MapPin className="size-5" />}
            title="Meet on campus"
            body="Hand over at a pre-approved spot on your campus. Cash or UPI, in person."
          />
        </ul>
      </div>

      <div className="mt-12 space-y-3">
        <Link href="/signup" className="block">
          <Button size="lg" className="w-full">
            Get started
          </Button>
        </Link>
        <Link href="/login" className="block">
          <Button size="lg" variant="secondary" className="w-full">
            I already have an account
          </Button>
        </Link>
        <p className="pt-2 text-center text-xs text-[var(--muted)]">
          ReWyse never handles your money. Payment happens in person, between you and the other
          student.
        </p>
      </div>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="bg-brand-100 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-xl">
        {icon}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--muted)]">{body}</p>
      </div>
    </li>
  );
}
