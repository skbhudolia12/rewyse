import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, PackageCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { Button, Wordmark } from '@/components/ui';
import { getUser } from '@/lib/auth/session';
import { computeSuggestion } from '@/lib/pricing/rails';
import { formatINR } from '@/lib/utils';

/** Real output of the pricing rails for one example item, not illustrative numbers. */
const EXAMPLE_BASE = 6000;
const EXAMPLE_DAYS = [21, 10, 5, 2] as const;

export default async function LandingPage() {
  // A signed-in student has no reason to read the pitch again.
  if (await getUser()) redirect('/home');

  return (
    <main className="flex-1">
      <nav className="border-hairline border-b">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Wordmark />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-paper-dim hover:text-paper flex min-h-11 items-center px-3 text-sm font-medium"
            >
              Sign in
            </Link>
            <Link href="/signup">
              <Button variant="flame">Join with your college email</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 py-14 md:px-8 md:py-24 lg:grid-cols-[1fr_440px]">
        <div>
          <p className="text-paper-dim text-sm font-medium">
            For verified students at IIIT Delhi, IIT Delhi and DTU
          </p>
          <h1 className="font-display mt-5 text-5xl md:text-7xl">Sell it before you leave.</h1>
          <p className="text-paper-dim mt-6 max-w-xl text-lg leading-relaxed">
            List your room stuff in a minute. ReWyse prices it for your move-out date, delivers it
            to the buyer, and holds the payment until they confirm it arrived as described.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="flame" size="lg">
                Start selling
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="lg">
                Browse items
              </Button>
            </Link>
          </div>
        </div>

        <PriceDropCard />
      </section>

      <section className="border-hairline bg-ink-raised border-y">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <h2 className="font-display max-w-2xl text-3xl md:text-4xl">How a sale works</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-4">
            <Step
              n={1}
              icon={<ShieldCheck className="size-5" />}
              title="Verify once"
              body="College email plus a photo of your ID, checked by a person. The photo is deleted after review."
            />
            <Step
              n={2}
              icon={<Camera className="size-5" />}
              title="Snap and describe"
              body="Take photos or a short video in the app. Add what's included and any flaws."
            />
            <Step
              n={3}
              icon={<Sparkles className="size-5" />}
              title="Get a price"
              body="The AI explains what your item is worth, then the price adjusts to how soon you move out."
            />
            <Step
              n={4}
              icon={<PackageCheck className="size-5" />}
              title="We deliver, you get paid"
              body="A delivery partner collects from your hostel. You're paid once the buyer confirms receipt."
            />
          </ol>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap justify-between gap-4 px-5 py-10 text-[13px] md:px-8">
        <span className="text-paper-dim">ReWyse, built by students at IIIT Delhi</span>
        <span className="text-paper-faint">No commission for sellers</span>
      </footer>
    </main>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li>
      <div className="text-paper-dim flex items-center gap-3">
        <span className="border-hairline-strong text-paper flex size-8 items-center justify-center rounded-full border text-sm font-semibold">
          {n}
        </span>
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="text-paper-dim mt-2 text-[15px] leading-relaxed">{body}</p>
    </li>
  );
}

/** The product's idea in one picture: the same item, quoted at four distances from move-out. */
function PriceDropCard() {
  const rows = EXAMPLE_DAYS.map((days) => ({
    days,
    price: computeSuggestion({
      baseValue: EXAMPLE_BASE,
      functionalStatus: 'fully_working',
      daysUntilMoveout: days,
    }).sellFastPrice,
  }));
  const top = rows[0]!.price;

  return (
    <aside
      aria-label="Example: how the price of a monitor changes as move-out gets closer"
      className="border-hairline-strong bg-ink-raised rounded-2xl border p-6"
    >
      <p className="font-medium">Dell 24&quot; monitor, fully working</p>
      <p className="text-paper-dim mt-1 text-sm">Suggested quick-sale price</p>
      <ul className="mt-6 space-y-4">
        {rows.map((r) => {
          const urgent = r.days <= 5;
          return (
            <li key={r.days}>
              <div className="flex items-baseline justify-between text-sm">
                <span className={urgent ? 'text-flame-bright font-medium' : 'text-paper-dim'}>
                  {r.days} days before move-out
                </span>
                <span className="text-base font-semibold">{formatINR(r.price)}</span>
              </div>
              <div className="bg-surface mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className={urgent ? 'bg-flame h-full' : 'bg-paper-faint h-full'}
                  style={{ width: `${Math.round((r.price / top) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
