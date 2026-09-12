# ReWyse — Build Plan & Progress

Living document. Phase status is updated as work lands.
Source spec: [`ReWyse_Website_Build_Spec.md`](./ReWyse_Website_Build_Spec.md)

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation — scaffold, schema, RLS, pricing rails | ✅ **Complete** |
| 1 | Identity & the trust gate | ⬜ Next |
| 2 | Listing + pricing engine | ⬜ |
| 3 | Discovery | ⬜ |
| 4 | Transaction — chat, offers, meetups *(pilot opens)* | ⬜ |
| 5 | Profile, trust, ops, hypothesis dashboard | ⬜ |

---

## Context

ReWyse is a campus marketplace for the Foundations of Entrepreneurship course, built as a **real pilot with actual students** on the Delhi cluster (IIITD + IITD + DTU), not a demo mock-up. Every feature ships live and functional; seeded data exists only to make the feed look populated at launch.

The product's reason to exist is one testable hypothesis: **a seller facing a move-out deadline will accept an urgency-scaled "sell-fast" price without countering.** Everything here either produces evidence for that hypothesis or exists to get a listing safely in front of a buyer.

**Form factor: mobile-first responsive web app (installable PWA), not a native app.** Distribution on a campus is a link in a WhatsApp group; an app-store install is a dead end for an unknown brand. Live camera capture works via `<input type="file" capture="environment">`, so nothing requires native. Design at 390px; desktop is a centered column with a wider grid on the feed only.

## Locked decisions

| Decision | Choice |
|---|---|
| Platform | Mobile-first responsive PWA |
| Stack | Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase |
| Pricing engine | LLM estimates base value; **deterministic code owns urgency math and rails** |
| Offers | Structured `Offer` entity, free-form chat alongside |
| Notifications | Transactional email + in-app badge; web push later |
| Chat safety | Safety banner + report button + admin review queue; no automated filtering |
| Campus scope | Full Delhi cluster day one — IIITD + IITD + DTU |
| ID documents | **Deleted on approve/reject**; only decision + reviewer + timestamp retained |
| Timeline | ~8 weeks, phased, pilot running alongside from Phase 4 |

## Free-tier stack — and where each cap bites

| Layer | Service | Free allowance | Where it hurts |
|---|---|---|---|
| Hosting | Vercel Hobby | ~100GB transfer, 1M invocations | **Non-commercial only.** No payments, no ads = compliant. |
| DB / Auth / Storage / Realtime | Supabase Free | 500MB DB, **1GB files**, 50k MAU, 200 concurrent realtime | **1GB file storage is the binding constraint.** No backups; pauses after 7 days idle. |
| LLM | Gemini Flash-Lite | ~15 RPM / ~1,000 req/day (verify in AI Studio) | Pricing panel re-runs on field change — uncached this burns quota in an afternoon. |
| LLM fallback | Groq | ~30 RPM / ~1,000 RPD per model | Secondary when Gemini 429s |
| Email | Resend | 3,000/mo, 100/day | Caps pilot notification volume |

---

# Phase 0 — Foundation ✅ Complete

**33 tests passing · typecheck clean · lint clean**

### Scaffold
- Next.js 16.3.5, React 19.2.8, Tailwind 4, Turbopack
- TS `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`
- Vitest, Prettier (+ Tailwind class sorting), ESLint
- Scripts: `dev` · `build` · `test` · `test:watch` · `typecheck` · `lint` · `format`

### Database — `supabase/migrations/`

`0001_schema.sql` — 17 tables, 13 enums. Implements every entity in spec §3 plus **four the spec requires behaviourally but never defines**:

| Table | Why it exists |
|---|---|
| `offers` | Spec makes "Make an Offer" a primary CTA but defines no entity. Without it, *"accepted at sell-fast price, zero counters"* means reading every chat thread by hand instead of running one query. |
| `pricing_events` | §6 mandates acceptance logging, defines no table. Records `prompt_version` so tuning the prompt mid-pilot doesn't silently blend two different experiments into one average. |
| `reports` | §8.5 requires the mechanism, defines no table. |
| `notifications` | Drives the in-app bell *and* the email dispatcher off one table so the two can't drift. |

`0002_functions.sql` — `verified_status` derived by trigger from both gates (no code path can mark someone verified who only cleared email); ID review decision mirrors to profile and **nulls the document path**; trust score recompute; conversation activity timestamps.

`0003_rls.sql` — Row Level Security on all 17 tables. Revoke-all-then-grant-explicitly, plus column-level grants so a student can edit their name and move-out date but never their own role, verification state, trust score, or ban status.

`seed.sql` — Delhi cluster, 3 campuses, domain allow-list, 9 meetup points, 10 seed comparables.

### Pricing rails — `src/lib/pricing/`
Pure functions, zero dependencies, 33 tests. The LLM will only ever supply `baseValue`; the urgency curve, condition multiplier, category clamps and rounding all live in tested code. Covers the urgency curve at 0/3/7/12/14/21/60 days, condition multipliers, hallucination clamps, every fallback path, outcome classification, and badge thresholds.

### Auth & config — `src/lib/`
Zod-validated env split into public/server halves; Supabase browser, server (RLS-bound) and admin (service-role) clients; middleware session refresh with signed-in gating.

### Three decisions made during the build

1. **ID documents live in their own table** (`id_verifications`), not a column on `profiles`. Postgres RLS is row-level — with the path on `profiles`, any policy letting students see peer profiles would expose ID paths too.
2. **Trust score counts only `actioned` reports.** Spec §7 subtracts 15 per flagged listing; as written, any student could tank a rival's score by filing reports.
3. **`price_cache` is not granted to `authenticated` at all.** The anon key is public, so a client-writable cache means a forged base value flows into a real seller's price.

### ⚠️ Open decision: the urgency curve

`clamp(days / 21, 0.6, 1.0)` reaches its floor at **12.6 days**, so every listing from 12 days out to move-out day prices *identically* — the exact window the product's pitch is about.

| Days out | Spec formula | Proposed |
|---|---|---|
| 21 | ₹8,500 | ₹8,500 |
| 12 | ₹5,100 | ₹7,050 |
| 7 | ₹5,100 | ₹6,250 |
| 3 | ₹5,100 | ₹5,600 |
| 0 | ₹5,100 | ₹5,100 |

Fix is one line — interpolate across the window instead of clamping into it:
```ts
urgency = URGENCY_FLOOR + (1 - URGENCY_FLOOR) * clamp(days / 21, 0, 1)
```
Currently implemented **as specced**, with the flat region pinned in a test that explains why. Awaiting a decision.

---

# Phase 1 — Identity & the trust gate ⬜ Next

- `/signup` per §5.1: name, campus email, cluster select, hostel, move-out date, ID capture, trust-copy block
- Two independent gates: email domain match **AND** admin ID approval → `verified`
- "Verification pending — usually reviewed within 24 hours" state (ship that copy only once someone owns the queue)
- Admin console v1: ID review queue, approve/reject with reason, image deleted on decision
- Route gating: unverified users cannot list, chat, or offer

**Needs:** live Supabase project + keys in `.env.local`.

# Phase 2 — Listing + pricing engine ⬜  ← the hypothesis

- `/listing/new` 3-step flow per §5.3
- Mandatory live camera capture for ≥1 photo; client-side compression
- Optional ≤20s verification video → `✓ Video Verified` badge
- LLM base-value service: Zod-validated output, Postgres cache keyed on item identity (never on move-out date), 800ms debounce, per-user rate limit, Gemini → Groq → category-default fallback chain, 8s timeout
- `pricing_events` logging from the first suggestion
- `/listing/:id` detail per §5.4 + `/listing/:id/edit`

# Phase 3 — Discovery ⬜

- `/home` per §5.2: cluster switcher, Move-Out Clearance rail (≤7 days), category chips, Nearby Verified grid
- Campus abbreviation chip on every card (`✓ IITD`)
- Video-verified listings rank above photo-only
- `/search` + filters
- **Seed ~40 listings across all three campuses before this goes live.** A cluster feed with six items reads as dead.

# Phase 4 — Transaction ⬜  ← pilot opens here

- Chat via Supabase Realtime; sticky listing context; non-dismissible safety banner
- Structured offers: Accept / Counter / Decline, counter chains, all logged
- Meetup proposal card: campus-specific `SafeMeetupPoint` chips + date/time picker
- Status machine: both confirm → `confirmed` + `pending_pickup` → `completed`
- Email notifications (Resend) + in-app bell
- Report button on threads and listings → admin queue

# Phase 5 — Profile, trust, ops ⬜

- `/profile` My Campus Hub per §5.6 + `/profile/:userId`
- **"Drop Price with AI Assistant"** — re-runs pricing at the shorter days-remaining, logs a new `pricing_event` (second independent data point, cheap since base value is cached)
- Trust score display (integers only, no ML framing)
- Admin console v2: report queue, ban/warn, takedown, comparables editor
- **Hypothesis dashboard**: sell-fast acceptance rate, counter frequency, time-to-sale vs days-to-move-out, price-vs-suggestion distribution — this is what you present

### Deferred by design
Web push, LLM + live web search pricing, automated ID verification (OCR/face-match), automated chat moderation, multi-cluster expansion.

---

## Risks

| Risk | Mitigation |
|---|---|
| **ID review queue becomes the growth bottleneck** (spec §8.6 flags this itself) | Named owner + rota before Phase 4. Measure real turnaround; change the "24 hours" copy the moment it stops being true. |
| **1GB storage exhausted mid-pilot** | Client-side compression, ID deletion on decision, media cleanup job. Monitor from Phase 2. |
| **LLM quota exhausted during a demo** | Cache + debounce + provider fallback + deterministic final fallback. The panel always returns a number. |
| **Empty feed across 3 campuses** | 40 seeded listings before Phase 3; ~5 real sellers per campus before Phase 4. |
| **Student ID photos are regulated personal data (DPDP Act)** | Delete-on-decision, RLS-restricted to admins, consent copy at upload. |
| **Safety incident during pilot** | Safety banner, pre-approved meetup points only, report queue with a named owner, ban capability. |
| **Supabase free has no backups** | Weekly `pg_dump` once real pilot data exists. Losing real user data mid-course is unrecoverable. |
| **Project lives in a OneDrive folder** | OneDrive syncs `node_modules` (~30k files) and fights Next's `.next` cache. If the dev server gets slow or throws file-lock errors, this is why. |

## Verification

- **Pricing rails**: Vitest unit tests on pure functions — urgency curve boundaries, condition multipliers, clamps, comparables override, every fallback. No LLM calls in unit tests.
- **LLM layer**: contract tests that Zod rejects malformed output and the fallback chain fires on 429/timeout. Stub the provider; never hit it in CI.
- **RLS**: integration tests asserting a user cannot read another cluster's listings, another user's messages/offers, or any ID document.
- **Auth gates**: an unapproved user is blocked from listing, chat, and offers at both the API and the UI.
- **Transaction flow**: Playwright end-to-end — signup → verify → list → price → browse → offer → counter → accept → meetup → complete, asserting status transitions and `pricing_events` rows.
- **Manual, on a real phone**: camera capture, upload compression, full create-listing flow on Android Chrome *and* iOS Safari before Phase 4. This is where mobile web actually breaks.
- **Quota rehearsal**: before any demo, confirm the pricing panel still returns a number with the LLM key revoked.
