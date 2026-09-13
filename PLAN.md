# ReWyse — Build Plan & Progress

Living document. Phase status is updated as work lands.
Source spec: [`ReWyse_Website_Build_Spec.md`](./ReWyse_Website_Build_Spec.md)

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation — scaffold, schema, RLS, pricing rails | ✅ **Complete** |
| 1 | Identity & the trust gate | ✅ **Complete** |
| 2 | Listing + pricing engine | ✅ **Complete** — see [PHASE2-CHECKLIST.md](./PHASE2-CHECKLIST.md) |
| 3 | Discovery | ✅ **Complete** |
| 4 | Transaction — chat, offers, meetups *(pilot opens)* | ✅ **Complete** |
| 5 | Profile, trust, ops, hypothesis dashboard | ✅ **Complete** |

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
| Visual direction | "Move-out season" — orange/black, flame reserved for time running out |
| Payments | **Reversed from spec:** funds held until buyer confirms receipt (Phase 4, see checklist) |
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

**33 unit tests · 20 RLS integration tests · typecheck clean · lint clean · build clean · database live**

### Verified end to end

| Check | Command | Result |
|---|---|---|
| Migrations applied | `npm run db:migrate` | 3/3, transactional, checksum-tracked |
| Schema + functions | `npm run check:db` | 17 tables, 4 RPC helpers, seed present |
| Security model | `npm run test:integration` | 20/20 — see below |
| Pricing rails | `npm test` | 33/33 |
| Production build | `npm run build` | compiles, no warnings |
| Auth gate | `GET /home` | `307 → /login?next=%2Fhome` |

RLS is proven against the live database rather than inferred: anonymous reads blocked on every private table; an unverified user cannot browse or create listings; a verified user sees another campus **in their own cluster** but not a different cluster's; non-parties cannot read or inject into a conversation; ID documents never leak to a peer; and a student cannot write their own `role`, `trust_score`, or `id_review_status`.

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

Seed data lives in `scripts/seed.mjs` (`npm run seed`) rather than SQL — idempotent upserts with fixed UUIDs, re-runnable without duplicating rows. Migrations stay SQL; seed data does not, so there is one source of truth for it.

### Pricing rails — `src/lib/pricing/`
Pure functions, zero dependencies, 33 tests. The LLM will only ever supply `baseValue`; the urgency curve, condition multiplier, category clamps and rounding all live in tested code. Covers the urgency curve at 0/3/7/12/14/21/60 days, condition multipliers, hallucination clamps, every fallback path, outcome classification, and badge thresholds.

### Auth & config — `src/lib/`
Zod-validated env split into public/server halves; Supabase browser, server (RLS-bound) and admin (service-role) clients; middleware session refresh with signed-in gating.

### Three decisions made during the build

1. **ID documents live in their own table** (`id_verifications`), not a column on `profiles`. Postgres RLS is row-level — with the path on `profiles`, any policy letting students see peer profiles would expose ID paths too.
2. **Trust score counts only `actioned` reports.** Spec §7 subtracts 15 per flagged listing; as written, any student could tank a rival's score by filing reports.
3. **`price_cache` is not granted to `authenticated` at all.** The anon key is public, so a client-writable cache means a forged base value flows into a real seller's price.

### ✅ Resolved: the urgency curve

The spec's `clamp(days / 21, 0.6, 1.0)` floored at 12.6 days, so every listing from twelve days out to the morning of move-out priced identically — flat across exactly the window the product is about.

Replaced with a normalised exponential (`URGENCY_DECAY_DAYS = 7`), steepest near the deadline:

| Days out | Old | Now |
|---|---|---|
| 21 | ₹8,500 | ₹8,500 |
| 14 | ₹5,650 | ₹8,200 |
| 12 | ₹5,100 | ₹8,050 |
| 7 | ₹5,100 | ₹7,350 |
| 3 | ₹5,100 | ₹6,350 |
| 1 | ₹5,100 | ₹5,600 |
| 0 | ₹5,100 | ₹5,100 |

Monotonic everywhere, hits both endpoints exactly, and ~68% of the discount lands inside the final week — matching how the pressure actually works. Pinned by tests asserting strict decrease across the final fortnight.

---

# Phase 1 — Identity & the trust gate ✅ Complete

**55 unit tests · 30 integration tests · typecheck, lint and build clean**

### Auth
Login and signup are one flow: a single emailed sign-in link, no password. Splitting them would answer "does this address have an account?" to anyone who asks, and would strand any student interrupted between confirming their email and filling in details. `/auth/callback` handles both the PKCE `code` and `token_hash` shapes, so an email-template change in the dashboard cannot silently break sign-in, and routes by how far through onboarding the user actually is.

### The two gates
- **Gate A — campus email.** Allow-list matched on the *full* domain. `resolveCampusForEmail` is a tested pure function: `notiiitd.ac.in`, `cse.iiitd.ac.in`, `iiitd.ac.in@gmail.com` and `iiitd.ac.in.evil.com` are all rejected, each of which passes a naive `endsWith` check. Set only after the user follows the emailed link, so it means inbox access and not just a typed string.
- **Gate B — ID review.** Photo captured in-app, compressed client-side to ~400KB, uploaded straight to private storage. A human reviewer approves or rejects.
- `verified_status` is derived by trigger from both. No code path can mark someone verified who only cleared email.

### Review queue — `/admin/verifications`
Oldest-first, signed URLs expiring in 10 minutes, approve or reject-with-reason. On decision the row's path is nulled *and* the storage object is deleted — a null column with a live file in the bucket is a lost pointer to retained personal data, not deletion. Admin is not self-serve; `npm run make-admin -- <email>` is the only way in.

### Storage — `0004_storage.sql`
Both buckets private. `id-documents` is readable by its owner and admins only; `listing-media` requires `is_verified()` to write. Tested: a student cannot upload into another's folder, download their ID, or sign a URL for it, and the bucket is not publicly fetchable.

### Design system
Mobile-first at 390px, 44px minimum tap targets, 16px inputs so iOS does not zoom on focus, `prefers-reduced-motion` respected, safe-area insets handled. Urgency colour is reserved exclusively for move-out countdowns — if it appears elsewhere it stops meaning "this is running out", which is the one signal the product depends on.

### ⚠️ Blocker before any real student signs up

**Supabase's built-in email service sends 2 messages per hour, project-wide.** Not per user — two, total. Sign-in is unusable beyond a single test until custom SMTP is configured (Authentication → SMTP). Resend's free tier is 3,000/month and is already in `.env.example` as `RESEND_API_KEY`. Custom SMTP starts at 30/hour, raisable in the dashboard's rate-limit settings.

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

# Phase 4 — Transaction ✅ Complete

**88 unit · 77 integration · typecheck, lint and build clean**

### Chat
Realtime over Supabase (`messages`, `offers`, `meetup_proposals` added to the publication — without that the thread renders correctly and simply never updates, which reads as a broken socket rather than a missing line of SQL). Thread list with unread counts, merged timeline of messages, offers and meetups, non-dismissible safety banner, report button.

### Structured offers
Offer, counter, accept, decline — every transition logged. `suggested_sell_fast_at_offer` is snapshotted onto each row so tuning the pricing prompt later cannot retroactively change what a historical offer is measured against, which is the pilot's whole hypothesis.

**Authority is enforced in Postgres, not the action layer:**
- The party who *made* an offer cannot accept it — otherwise a buyer accepts their own lowball and walks to checkout at that price.
- Accepting supersedes every other pending offer on the listing, so a seller cannot accept two buyers for one item.
- A resolved offer cannot be re-decided.
- An accepted offer becomes the checkout price; the sticker price is only a starting point.

### Meetups
Proposed from the pre-approved points on *either* party's campus — cross-campus deals are normal, meeting at a third campus nobody attends is not, and a trigger enforces it. The proposer cannot confirm their own proposal. Accepting moves the conversation to `confirmed` and the listing to `pending_pickup` together, so a scheduled handover always takes the item off the market.

### Safety
Report button on conversations; `/admin/reports` queue with action-or-dismiss. Only an **actioned** report counts against a trust score — dismissing a bad-faith report costs the reported student nothing, which is what stops report-count-as-weapon.

### Notifications
Written to the `notifications` table on every offer, message, acceptance and meetup. In-app only for now; the email dispatcher reads the same table and is gated on `RESEND_API_KEY`, so it starts working the moment SMTP is configured without a code change.


# Phase 5 — Profile, trust, ops ✅ Complete

**88 unit · 85 integration · typecheck, lint and build clean**

### My Campus Hub — `/profile`
User card with verification and campus, own move-out countdown, three stat tiles, listings and offers tabs. Average response time is deliberately **absent**: it needs message-timestamp aggregation we do not do yet, and a fabricated "15m" is worse than a missing tile.

### Drop Price with Smart Price
Two-step by design — shows the new number first, drops the price only when the seller agrees. Silently repricing someone's listing would be taking a decision that is theirs. Costs no model quota: the base value is cached under the item's identity and urgency is local arithmetic. Logged with `is_repricing`, which makes it the pilot's **second independent test** of the same hypothesis.

### Edit and remove — `/listing/[id]/edit`
The Phase 2 deferral, now done. Removal is a soft status change, never a delete: the pricing events and offers attached to a listing are the pilot's measurements, and deleting the row would drop a data point every time someone changed their mind.

### Public seller card — `/profile/[id]`
Name, campus, trust score, what they have for sale. Deliberately thin — a buyer deciding whether to meet a stranger needs those four things; hostel and move-out date are the seller's to share in chat, not the directory's to publish.

### Pilot dashboard — `/admin/insights`
The hypothesis, measured: headline acceptance rate, outcome distribution, acceptance bucketed by days-to-move-out, counter rate, repricing acceptance, median gap from suggestion, and engine health.

Two honesty mechanisms built in:
- Suggestions shown but never acted on are **excluded**. A seller who closed the form mid-way did not reject the price, and counting them as rejections would understate acceptance.
- Seeded demo rows carry `prompt_version = 'demo-seed'`, are **counted separately**, and the page says on its face when they are present. A fabricated acceptance rate indistinguishable from a real one is how a made-up number reaches a pitch deck.

Colour: one accent. A four-hue categorical palette was checked against this surface and failed CVD separation outright (`#cfcac1` ↔ `#6ee7a8`, ΔE 3.0 deutan). Flame marks the hypothesis; everything else is neutral and every bar is directly labelled, so nothing is encoded by colour alone.


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
