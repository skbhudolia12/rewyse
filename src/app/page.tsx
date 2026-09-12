import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Camera, MapPin, ShieldCheck } from 'lucide-react';
import { Button, Wordmark } from '@/components/ui';
import { getUser } from '@/lib/auth/session';

const TICKER = [
  'MOVE-OUT CLEARANCE',
  'STUDY TABLE · 4 DAYS LEFT',
  'IIITD → IITD → DTU',
  'MINI FRIDGE · 2 DAYS LEFT',
  'VERIFIED STUDENTS ONLY',
  'MONITOR · 6 DAYS LEFT',
];

export default async function LandingPage() {
  // A signed-in student has no reason to read the pitch again.
  if (await getUser()) redirect('/home');

  return (
    <main className="grid-paper flex-1">
      <nav className="border-hairline flex items-center justify-between border-b px-6 py-5 md:px-16">
        <Wordmark />
        <div className="text-paper-dim hidden items-center gap-10 text-sm font-medium md:flex">
          <span>Browse</span>
          <span>How pricing works</span>
          <span>Campuses</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-paper-dim hover:text-paper text-sm font-medium">
            Sign in
          </Link>
          <Link href="/signup">
            <Button variant="flame" className="rounded-full">
              Start selling
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-[1400px] gap-16 px-6 py-16 md:px-16 md:py-24 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="border-hairline-strong text-paper-dim mb-8 inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-[13px] font-medium">
            <span className="bg-flame inline-block size-1.5 rounded-full" />
            Live across IIITD · IITD · DTU
          </div>

          <h1 className="font-display text-6xl md:text-8xl">
            Sell it before
            <br />
            you <span className="text-flame">leave.</span>
          </h1>

          <p className="text-paper-dim mt-8 max-w-xl text-lg leading-relaxed">
            A marketplace for verified students only. Tell us your move-out date and we price your
            stuff to actually sell before it — not to sit unsold while you pack.
          </p>

          <div className="mt-10 flex flex-wrap gap-3.5">
            <Link href="/signup">
              <Button variant="flame" size="lg" className="rounded-full">
                List your first item
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="lg" className="rounded-full">
                Browse your campus
              </Button>
            </Link>
          </div>

          <dl className="mt-16 flex flex-wrap gap-x-12 gap-y-6">
            <Stat value="3" label="campuses, one cluster" />
            <Stat value="0%" label="commission, ever" />
            <Stat value="48h" label="typical sale near move-out" flame />
          </dl>
        </div>

        <CountdownCard />
      </section>

      <div className="border-hairline bg-flame text-ink overflow-hidden border-y py-4">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
              {TICKER.map((text, i) => (
                <span
                  key={text}
                  className={`font-display px-7 text-xl ${i % 2 ? 'opacity-45' : ''}`}
                >
                  {text}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1400px] px-6 py-20 md:px-16 md:py-28">
        <h2 className="font-display max-w-3xl text-4xl md:text-5xl">
          Three steps. No haggling in a hostel corridor.
        </h2>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          <Step
            n="01"
            icon={<ShieldCheck className="size-5" />}
            title="Prove you're a student"
            body="College email plus a photo of your ID card, checked by a person. Your ID photo is deleted the moment you're approved."
          />
          <Step
            n="02"
            icon={<Camera className="size-5" />}
            title="Snap it, set the date"
            body="Photograph the item in the app — no stock images. Tell us when you're vacating and you get a price in seconds."
          />
          <Step
            n="03"
            icon={<MapPin className="size-5" />}
            title="Meet on campus"
            body="Pick a pre-approved spot on your campus. Hand over in person, in daylight, where people are around."
          />
        </div>
      </section>

      <section className="bg-paper text-ink px-6 py-20 md:px-16 md:py-28">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-10">
          <h2 className="font-display max-w-2xl text-5xl md:text-7xl">
            Your room empties either way.
          </h2>
          <Link href="/signup">
            <Button
              size="lg"
              className="bg-ink text-paper hover:bg-ink-raised rounded-full whitespace-nowrap"
            >
              Start selling
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
        <div className="mx-auto mt-16 flex w-full max-w-[1400px] flex-wrap justify-between gap-4 border-t border-black/15 pt-7 text-[13px] text-black/60">
          <span>ReWyse — built by students at IIIT Delhi</span>
          <span>Verified students only. Every handover happens on campus.</span>
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label, flame }: { value: string; label: string; flame?: boolean }) {
  return (
    <div>
      <dt className={`font-display text-4xl ${flame ? 'text-flame' : ''}`}>{value}</dt>
      <dd className="text-paper-dim mt-1.5 text-[13px]">{label}</dd>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="border-hairline bg-surface hover:border-flame-edge rounded-2xl border p-8 transition-transform duration-300 hover:-translate-y-1.5">
      <div className="text-flame flex items-center gap-3">
        <span className="font-display text-sm tracking-[0.12em]">{n}</span>
        {icon}
      </div>
      <h3 className="font-display mt-5 text-2xl">{title}</h3>
      <p className="text-paper-dim mt-3 text-[15px] leading-relaxed">{body}</p>
    </div>
  );
}

/** The signature artifact: the countdown the whole product is organised around. */
function CountdownCard() {
  return (
    <aside className="border-hairline-strong bg-surface h-fit overflow-hidden rounded-3xl border">
      <div className="border-hairline text-paper-dim flex items-center justify-between border-b px-6 py-4 text-xs font-semibold tracking-[0.14em] uppercase">
        <span>Your move-out</span>
        <span className="tracking-normal normal-case">14 May</span>
      </div>

      <div className="px-6 pt-9 pb-6 text-center">
        <div className="font-display text-flame text-[8rem] leading-[0.8]">06</div>
        <div className="text-paper-dim mt-4 text-[13px] font-semibold tracking-[0.2em] uppercase">
          days left
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="from-flame to-flame-amber h-full w-[72%] bg-gradient-to-r" />
        </div>
      </div>

      <div className="border-hairline border-t p-6">
        <p className="text-paper-dim text-xs font-semibold tracking-[0.14em] uppercase">
          Dell 24&quot; Monitor
        </p>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-paper-dim text-sm">Fair range</span>
          <span className="text-paper-faint text-[15px] line-through">₹5,100 – ₹6,300</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm font-semibold">Sell-fast price</span>
          <span className="font-display text-flame text-3xl">₹3,750</span>
        </div>
        <div className="bg-flame-soft text-flame-bright mt-5 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold">
          Expected to sell within 48 hours
        </div>
      </div>
    </aside>
  );
}
