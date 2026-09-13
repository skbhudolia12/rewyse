import { Card, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { getInsights, type DayBucket, type OutcomeBucket } from '@/lib/admin/insights';

export const dynamic = 'force-dynamic';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The hypothesis dashboard.
 *
 * Colour carries one meaning here, the same as everywhere else in the product:
 * flame marks the thing the pilot is testing. Every other bar is neutral, and
 * every bar is directly labelled, so nothing is encoded by colour alone -- a
 * four-hue categorical palette on this surface failed CVD separation outright
 * when checked, which is the honest reason this page has one accent.
 */
export default async function InsightsPage() {
  await requireAdmin();
  const data = await getInsights();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10">
      <PageHeader
        eyebrow="Pilot"
        title="Does urgency pricing work?"
        subtitle="Whether a seller takes the sell-fast price when we show it to them."
      />

      {data.sample === 'none' ? (
        <Card className="py-12 text-center">
          <p className="font-display text-xl">No data yet</p>
          <p className="text-paper-dim mx-auto mt-2 max-w-sm text-sm leading-relaxed">
            Numbers appear here once sellers start publishing listings. Every price suggestion is
            already being logged.
          </p>
        </Card>
      ) : (
        <>
          <Hero rate={data.acceptanceRate} accepted={data.acceptedSellFast} decided={data.decided} />

          {data.seeded > 0 && (
            <div className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-amber-300">
                {data.seeded} of these {data.decided} are seeded demo rows
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-200/80">
                Invented so this page has something to draw. Do not quote this percentage as a
                result. Clear them with{' '}
                <code className="font-mono">npm run seed:demo -- --clear</code>.
              </p>
            </div>
          )}

          {data.sample === 'thin' && (
            <p className="border-hairline bg-surface text-paper-dim rounded-xl border px-4 py-3 text-[13px] leading-relaxed">
              <span className="text-paper font-semibold">Read this as a direction, not a result.</span>{' '}
              {data.decided} {data.decided === 1 ? 'listing' : 'listings'} is too few to put a
              percentage in a deck without saying so out loud.
            </p>
          )}

          <section className="space-y-4">
            <div>
              <h2 className="font-display text-xl">What sellers actually did</h2>
              <p className="text-paper-dim mt-1 text-[13px]">
                Where each seller landed relative to the price we suggested.
              </p>
            </div>
            <Card className="space-y-4">
              {data.outcomes.map((o) => (
                <OutcomeBar key={o.outcome} bucket={o} />
              ))}
            </Card>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="font-display text-xl">Acceptance as the deadline closes in</h2>
              <p className="text-paper-dim mt-1 text-[13px]">
                If urgency pricing works, this should rise from right to left.
              </p>
            </div>
            <Card className="space-y-4">
              {data.byDays.map((b) => (
                <DayBar key={b.label} bucket={b} />
              ))}
            </Card>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Offers countered"
              value={data.offers.total > 0 ? pct(data.offers.counterRate) : '—'}
              caption={`${data.offers.countered} of ${data.offers.total} offers`}
              note="A high counter rate means the suggested price is not landing."
            />
            <Stat
              label="Repricing accepted"
              value={data.repricing.runs > 0 ? pct(data.repricing.rate) : '—'}
              caption={`${data.repricing.accepted} of ${data.repricing.runs} drop-price runs`}
              note="The second, independent test of the same idea."
            />
            <Stat
              label="Median gap from suggestion"
              value={
                data.medianGapFromSuggestion === null
                  ? '—'
                  : `${data.medianGapFromSuggestion >= 0 ? '+' : ''}${Math.round(data.medianGapFromSuggestion * 100)}%`
              }
              caption="Where the typical seller landed"
              note="Zero means sellers take the number as given."
            />
            <Stat
              label="Priced by the model"
              value={
                data.engine.llm + data.engine.comparables + data.engine.categoryDefault > 0
                  ? String(data.engine.llm)
                  : '—'
              }
              caption={`${data.engine.comparables} from comparables · ${data.engine.categoryDefault} fell back`}
              note="Fallbacks mean the model was unavailable or rate-limited."
            />
          </section>

          <p className="text-paper-faint text-[12px] leading-relaxed">
            Based on {data.decided} price {data.decided === 1 ? 'suggestion' : 'suggestions'} that
            led to a published listing. Suggestions shown but never acted on are excluded — a
            seller who closed the form mid-way did not reject the price, and counting them as
            rejections would understate acceptance.
          </p>
        </>
      )}
    </main>
  );
}

/** The headline. A single number needs no chart. */
function Hero({ rate, accepted, decided }: { rate: number; accepted: number; decided: number }) {
  return (
    <Card className="space-y-3">
      <p className="text-paper-dim text-xs font-semibold tracking-[0.14em] uppercase">
        Took the sell-fast price
      </p>
      <p className="font-display text-flame text-7xl">{pct(rate)}</p>
      <p className="text-paper-dim text-sm">
        {accepted} of {decided} sellers published at exactly the price we suggested, without
        changing it.
      </p>
    </Card>
  );
}

function OutcomeBar({ bucket }: { bucket: OutcomeBucket }) {
  const isHypothesis = bucket.outcome === 'accepted_sell_fast';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className={`text-sm ${isHypothesis ? 'font-semibold' : 'text-paper-dim'}`}>
          {bucket.label}
        </span>
        <span className="text-paper-dim shrink-0 text-[13px] tabular-nums">
          <span className="text-paper font-semibold">{bucket.count}</span> · {pct(bucket.share)}
        </span>
      </div>
      <div className="bg-ink-raised mt-2 h-2.5 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${isHypothesis ? 'bg-flame' : 'bg-paper-faint'}`}
          style={{ width: `${Math.max(bucket.share * 100, bucket.count > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function DayBar({ bucket }: { bucket: DayBucket }) {
  const empty = bucket.total === 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm">{bucket.label}</span>
        <span className="text-paper-dim shrink-0 text-[13px] tabular-nums">
          {empty ? (
            'no listings'
          ) : (
            <>
              <span className="text-paper font-semibold">{pct(bucket.rate)}</span>{' '}
              <span className="text-paper-faint">
                ({bucket.accepted}/{bucket.total})
              </span>
            </>
          )}
        </span>
      </div>
      <div className="bg-ink-raised mt-2 h-2.5 overflow-hidden rounded-full">
        <div
          className="bg-flame h-full rounded-full"
          style={{ width: empty ? '0%' : `${Math.max(bucket.rate * 100, bucket.accepted > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  caption,
  note,
}: {
  label: string;
  value: string;
  caption: string;
  note: string;
}) {
  return (
    <Card>
      <p className="text-paper-dim text-[11px] font-semibold tracking-[0.13em] uppercase">
        {label}
      </p>
      <p className="font-display mt-2 text-3xl">{value}</p>
      <p className="text-paper-dim mt-1.5 text-[13px]">{caption}</p>
      <p className="text-paper-faint mt-3 text-[12px] leading-relaxed">{note}</p>
    </Card>
  );
}
