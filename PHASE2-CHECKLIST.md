# Phase 2 — Completion checklist

Checked against the build spec (§5.3, §5.4, §6) and `PLAN.md`, not against what happened to get built.

**Status: complete, with three items deliberately deferred and one blocked.**

| Suite | Result |
|---|---|
| Unit tests | 86 / 86 |
| Integration tests (RLS · storage · pricing) | 38 / 38 |
| Typecheck · lint · production build | clean |
| Live model check (`npm run check:llm`) | Gemini answering |

---

## What Phase 2 was supposed to deliver

### Pricing engine (spec §6) — the hypothesis

| Item | Status | Notes |
|---|---|---|
| LLM supplies base value only | ✅ Done | `src/lib/pricing/llm.ts`. Prompt is six ordered checks; model is told to assume the item works, so condition isn't discounted twice. |
| Deterministic urgency, condition, clamps | ✅ Done | `rails.ts` — pure, 33 tests. The model never touches this maths. |
| Schema validation of model output | ✅ Done | `parse.ts` + 30 tests covering prose, fenced JSON, string prices, negatives, `Infinity`, over-long reasoning. |
| Cache keyed on item identity, not date | ✅ Done | `price_cache`. Changing only the move-out date costs zero quota — urgency is local arithmetic. |
| Comparables override the model | ✅ Done | Longest-keyword-wins so "mini fridge" beats "fridge". |
| Provider fallback chain | ✅ Done | Gemini → Groq → category default. Proven by a test that runs with both keys unset. |
| Per-seller rate limit | ✅ Done | 20 model-backed quotes/hour. One seller can't drain the org quota. |
| Timeout | ✅ Done | 8s, then fallback. |
| `pricing_events` logged on every suggestion | ✅ Done | Including repricing runs; records `prompt_version` so a mid-pilot prompt change can be segmented out. |
| Asking price + outcome recorded | ✅ Done | `recordAskingPrice` classifies into accepted-sell-fast / within / above / below. |

### Create listing (spec §5.3)

| Item | Status | Notes |
|---|---|---|
| Multi-step flow | ✅ Done | Three sections on one page rather than three routes — less state to lose on a flaky hostel connection. |
| Category, title, photos | ✅ Done | |
| ≥1 photo must be a live camera capture | ✅ Done | Enforced in the UI **and** re-checked server-side, since the UI is not a security boundary. |
| Client-side compression | ✅ Done | ~300KB target. The 1GB storage cap makes this load-bearing. |
| Condition checklist | ✅ Done | Functional status, cosmetic flaws, accessories. |
| Move-out date picker | ✅ Done | Defaults from the seller's profile. |
| Live pricing panel, re-runs on change | ✅ Done | 800ms debounce. |
| Fair range + sell-fast price + caption | ✅ Done | |
| "High liquidity" badge | ✅ Done | |
| Set asking price | ✅ Done | Pre-filled with the sell-fast price; one tap to take either number. |

### Listing detail (spec §5.4)

| Item | Status | Notes |
|---|---|---|
| Photo gallery with signed URLs | ✅ Done | 1h TTL. |
| Move-out countdown banner, high priority | ✅ Done | Full-bleed flame bar inside the clearance window. |
| Title, price, fair-price badge | ✅ Done | |
| Seller mini-card with verification + trust | ✅ Done | |
| Structured condition block | ✅ Done | Three tiles, not free text. |
| Safe meetup zone block | ✅ Done | Pulls the campus's approved point. |
| Sticky action bar | ✅ Done | Offer/chat present but disabled — they're Phase 4. |

### Frontend reskin (this turn's first ask)

| Item | Status |
|---|---|
| Orange/black token system replacing teal | ✅ Done |
| Bricolage Grotesque + Instrument Sans | ✅ Done |
| Landing rebuilt to the mockup | ✅ Done |
| All Phase 1 screens migrated off old tokens | ✅ Done |
| Countdown, ticker, graph-paper motifs as components | ✅ Done |

---

## Deferred deliberately

| Item | Why | When |
|---|---|---|
| **Verification video** (§5.3, ≤20s) | Photos are compressible to ~300KB; a 20s video is ~5MB. At 1GB total, videos are the single fastest way to exhaust storage, and the badge is a nice-to-have next to the camera-capture rule that's already enforced. | Phase 5, or when storage is paid |
| **`/listing/:id/edit`** | Create and detail were the hypothesis-critical paths. Edit is CRUD over a form that already exists. | Start of Phase 3 |
| **"Drop Price with AI"** (§5.6) | Lives on the profile hub, which is Phase 5. The engine already supports it — `isRepricing` is wired and logged. | Phase 5 |

---

## Blocked

### 1. Nobody can sign up — Supabase sends 2 emails/hour

**Blocks:** the entire pilot, and your own end-to-end testing of Phases 1–2.

Supabase's built-in email is capped at **2 messages per hour project-wide** — not per user. You cannot complete two signup tests in an hour.

**Unblock:** create a free Resend account, add the API key to Supabase under **Authentication → SMTP**. Free tier is 3,000/month. Custom SMTP starts at 30/hour, raisable in the dashboard's rate-limit settings. ~15 minutes of work; nothing in the code changes.

**Also needed in the same visit:** add `http://localhost:3000/auth/callback` to **Authentication → URL Configuration → Redirect URLs**, or the sign-in link bounces.

### 2. Escrow contradicts the spec in three places

**Blocks:** Phase 4, not Phase 2.

You want payment held until the buyer confirms receipt. The spec rules it out in the scope line, §8.4 and §10 — that's fine to reverse, but it carries consequences:

- **Legal.** Holding other people's money in India requires an RBI-licensed payment aggregator. You cannot park student funds in your own account. The legitimate route is a licensed PA's marketplace escrow (Razorpay Route or similar), needing a registered entity and KYC — weeks, and not free.
- **Cost.** Vercel Hobby is non-commercial-use only; processing payments makes the deployment commercial. Vercel Pro is $20/month, plus ~2% gateway fees. This breaks the free-tier constraint the whole stack was chosen for.
- **Copy.** Fixed in the mockups this turn.

**Unblock — three options, honest about each:**

| Option | What ships | Cost / time |
|---|---|---|
| **A. Real escrow via a licensed PA** | Genuine held funds | Business entity + KYC, 2–4 weeks, paid hosting |
| **B. Build the flow against a gateway in test mode** *(recommended)* | Whole escrow UX demoable and correct; a licensed PA drops in later without a rewrite | Free, ~1 week, honest at demo |
| **C. Buyer-confirms-receipt without money** | The trust mechanism (confirm before the deal closes) without the funds | Free, ~2 days |

**Do not** ship a UI that tells students their money is protected when it isn't. That's the one version I won't build.

---

## Not blocked, but worth deciding

- ~~The urgency curve is flat across the final 12 days.~~ **Fixed.** Replaced with a normalised exponential decay (`URGENCY_DECAY_DAYS = 7`): monotonic everywhere, steepest near the deadline, ~68% of the discount inside the final week. 3 days out now quotes ₹6,350 where 12 days out quotes ₹8,050.
- **The landing copy is placeholder-grade.** You said the slogans are "meh" — agreed. "Sell it before you leave" and "The same desk is worth less on Sunday" are a first draft of a voice, not a finished one.
- **`gemini-2.5-flash-lite` was retired mid-build.** `npm run check:llm` caught it; now on `gemini-3.5-flash-lite`. Worth re-running that check before any demo.
