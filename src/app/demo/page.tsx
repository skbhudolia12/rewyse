import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, Wordmark } from '@/components/ui';
import { DEMO_ROLES, DEMO_ROLE_KEYS, demoAccessEnabled } from '@/lib/demo';
import { enterDemo } from './actions';
import { EnterButton } from './enter-button';

export const metadata: Metadata = {
  title: 'Try ReWyse',
  description: 'Sign in as a sample seller, buyer or operations account.',
};

const WALKTHROUGH = [
  'As the buyer, open any listing and make an offer a little under the price.',
  'Switch to the seller and accept the offer in Messages.',
  'Back as the buyer, tap Buy, enter a hostel and room, and pay.',
  'As operations, open Admin → Escrow and delivery and move the order to delivered.',
  'As the buyer, confirm you received it on the order page.',
  'As operations, release the payout to the seller.',
];

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const enabled = demoAccessEnabled();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-16 md:px-8 md:pt-12">
      <Link href="/" aria-label="ReWyse home">
        <Wordmark />
      </Link>

      <h1 className="font-display mt-10 text-4xl leading-tight md:text-5xl">Try ReWyse</h1>
      <p className="text-paper-dim mt-3 max-w-2xl text-[17px] leading-relaxed">
        Pick an account to try the marketplace. You can switch between them at any time from the
        header, so one window is enough to follow a sale from listing to payout.
      </p>

      {error && (
        <div className="mt-6 max-w-2xl">
          <Alert tone="error">
            {error === 'unavailable'
              ? 'Sign-in is unavailable right now. Try again in a minute.'
              : 'Choose one of the accounts below.'}
          </Alert>
        </div>
      )}

      {enabled ? (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {DEMO_ROLE_KEYS.map((key, i) => {
            const role = DEMO_ROLES[key];
            return (
              <Card key={key} className="flex flex-col p-5">
                <p className="text-flame text-sm font-semibold">{role.label}</p>
                <p className="mt-2 text-lg font-semibold">{role.person}</p>
                <p className="text-paper-faint text-sm">{role.context}</p>
                <p className="text-paper-dim mt-3 flex-1 text-[15px] leading-relaxed">{role.does}</p>
                <form action={enterDemo} className="mt-5">
                  <input type="hidden" name="role" value={key} />
                  <EnterButton label={role.label} primary={i === 1} />
                </form>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 max-w-2xl">
          <Alert tone="info">Demo access is closed. Sign in with your college email instead.</Alert>
        </div>
      )}

      <section className="mt-12 grid gap-10 md:grid-cols-[1fr_20rem]">
        <div>
          <h2 className="text-xl font-semibold">A sale from start to finish</h2>
          <ol className="mt-4 space-y-3">
            {WALKTHROUGH.map((step, i) => (
              <li key={step} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="bg-ink-elevated text-paper-dim flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="text-paper-dim">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">See the AI price an item</h2>
            <p className="text-paper-dim mt-3 text-[15px] leading-relaxed">
              As the seller, tap Sell, add a photo and fill in the item. The price check explains
              what the item is worth and how the move-out date changes the price.
            </p>
          </div>
          <p className="text-paper-faint text-sm leading-relaxed">
            These are sample accounts and sample listings. Checkout uses a test payment gateway, so
            no real money moves.
          </p>
        </div>
      </section>
    </main>
  );
}
