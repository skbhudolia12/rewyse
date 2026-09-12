# ReWyse — Website Build Spec

**Scope:** Listing, rule-based pricing, browsing, cross-campus discovery, campus-ID verification, pickup scheduling.
**Explicitly out of scope:** Payments/escrow (peer-to-peer cash/UPI handled off-platform). No in-app checkout.

**Note on scope vs. the pitch deck:** the pitch deck's MVP slide (Slide 11) marks both "cross-campus matching" and "verification" as *Post-Feedback, Not Now* — deferred past the first build. This spec deliberately includes both from day one, per direct instruction. If you're presenting the deck and the live product side by side, be ready to explain that the build scope is slightly ahead of the pitched MVP.

---

## 1. Product Summary

A campus marketplace where students sell items they no longer need — mostly driven by move-out deadlines — to other verified students nearby, at below-retail prices. The core differentiator is a **rule-based suggested price** tied to how many days remain until the seller's move-out date: the same item is priced differently at 3 weeks out vs. 3 days out.

**Primary persona (seller):** A student with a fixed move-out date, holding low-effort-to-sell items (electronics, furniture, books) they want gone — not necessarily at top price, just gone before the deadline.

**Primary persona (buyer):** A budget-constrained student (often upgrading, or a junior/new admit) looking for a specific item at below-retail price, who needs to trust the seller and the price before committing.

---

## 2. User Roles

| Role | Description |
|---|---|
| **Guest** | Can browse public listing previews, cannot see contact info, chat, or full listing detail. Must sign up to do anything else. |
| **Verified Student** | Signed up with a `.edu`/campus-domain email, selected a campus/cluster. Can list, browse fully, chat, propose meetups. |
| **Admin** (internal, not end-user-facing in MVP) | Can view flagged listings/users, manually verify edge-case sign-ups, moderate chat reports. |

No "unverified but signed up" state should persist — verification is a required step in onboarding, not optional.

---

## 3. Core Entities (Data Model)

### `User`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| full_name | string | |
| email | string | Must match an allow-listed campus domain pattern |
| campus_id | fk → Campus | |
| hostel_or_hall | string | Free text, optional |
| graduation_or_moveout_date | date | Drives the pricing engine directly |
| id_document_url | url | Photo or short video of physical college ID, uploaded at signup — see §5.1 |
| id_review_status | enum | `not_submitted`, `pending_review`, `approved`, `rejected` |
| verified_status | enum | `pending`, `verified`, `rejected` — see §5.1 for how this combines with `id_review_status` |
| trust_score | integer (0–100) | Derived, see §7 |
| created_at | datetime | |

### `Campus`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | e.g. "IIT Delhi" |
| cluster_id | fk → Cluster | |

### `Cluster`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | e.g. "Delhi Cluster: IIITD + IITD + DTU" |
| campus_ids | array<fk> | |

Cross-campus discovery is **cluster-scoped**, not global — a user only ever browses within their assigned cluster. This matches the wireframe's cluster selector pattern.

### `Listing`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| seller_id | fk → User | |
| title | string | |
| category | enum | Electronics, Furniture, Books, Appliances, Other |
| photos | array<url> | Min 1, max 5. At least one must be a live capture (see below), not a gallery-picked stock-style image |
| verification_video_url | url, nullable | Optional short video (max ~20s) of the item, showing it powering on / functioning where applicable |
| condition_functional_status | enum | Fully working / Partially working / For parts |
| condition_cosmetic_flaws | string | Free text, short |
| condition_accessories_included | string | Free text, short |
| moveout_date | date | Copied from seller at listing time (editable per-listing) |
| suggested_price_min | integer | Computed, see §6 |
| suggested_price_max | integer | Computed, see §6 |
| asking_price | integer | Seller-set; can equal, exceed, or undercut suggested range |
| status | enum | `active`, `pending_pickup`, `completed`, `removed` |
| created_at | datetime | |

### `Conversation` / `Message`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| listing_id | fk → Listing | |
| buyer_id | fk → User | |
| seller_id | fk → User | |
| messages | array<Message> | sender_id, body, timestamp |
| proposed_meetup_location | string, nullable | From a constrained list, see §8 |
| proposed_meetup_time | datetime, nullable | |
| status | enum | `open`, `meetup_proposed`, `confirmed`, `completed`, `cancelled` |

### `SafeMeetupPoint`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campus_id | fk → Campus | |
| name | string | e.g. "Library Foyer", "Hostel Gate 1" |
| active | boolean | |

Meetup points are **pre-defined per campus by admins**, not freely typed by users — this is a trust/safety control, not a UX nicety. Matches the wireframe's "Safe Campus Meetup Zone" chip pattern.

---

## 4. Pages & Routes

| Route | Page | Auth required |
|---|---|---|
| `/` | Landing / marketing page | No |
| `/signup` | Sign up + campus ID verification | No |
| `/login` | Log in | No |
| `/home` | Browse feed (cluster-scoped) | Yes |
| `/search` | Search + filters | Yes |
| `/listing/:id` | Listing detail | Yes (preview-only teaser if guest) |
| `/listing/new` | Create listing (multi-step) | Yes |
| `/listing/:id/edit` | Edit own listing | Yes, owner only |
| `/messages` | Conversation list | Yes |
| `/messages/:conversationId` | Chat thread + meetup proposal | Yes |
| `/profile` | My Campus Hub (own listings, stats) | Yes |
| `/profile/:userId` | Public profile (seller card view) | Yes |

---

## 5. Page-by-Page Component Breakdown

### 5.1 Sign Up (`/signup`)
Matches wireframe screen 1, extended with a second verification step. Fields, in order:
1. Full Name — text
2. College Email (.edu / campus domain) — text, validated against allow-list
3. Select Campus / City Cluster — dropdown (populated from `Cluster`)
4. Hostel / Hall of Residence — text, optional
5. Graduation / Move-Out Month & Year — date picker
6. **College ID Upload** — camera capture or file upload, photo or short video (max ~15s) of the physical student ID card. See below for why this is a second, separate step from the email check.
7. **Verified Student Shield** — static trust-copy block: "Only verified campus peers can message or buy."
8. CTA: **Verify Campus ID & Continue**

**Two-part verification logic (email is necessary, ID upload is what actually confirms identity):**
- **Step A — Email domain match:** checked instantly against the campus's registered domain(s). This alone is *not* sufficient to fully verify — it only proves the person has access to a campus-issued inbox, not that the ID upload belongs to the same person. Sets `id_review_status = not_submitted` until step B happens.
- **Step B — ID photo/video review:** the uploaded image/video is queued for review (`id_review_status = pending_review`). For v1, this is a **manual admin review queue**, not automated OCR/face-match — keep the review UI simple (approve/reject with an optional reason), and don't claim automated verification in the product copy until it's actually built.
- `verified_status` only becomes `verified` once **both** the email domain matches **and** `id_review_status = approved`. If either fails, the account stays blocked from listing, messaging, and making offers.
- Until `id_review_status` is resolved, show the user a clear "Verification pending — usually reviewed within 24 hours" state rather than leaving them in a silent limbo screen.

**Known v1 limitation to flag explicitly, not hide:** this is identity *screening*, not identity *proofing* — a manual reviewer glancing at an uploaded photo can be fooled. Don't market this as tamper-proof KYC; it's a meaningfully higher bar than "typed an email," not a legal-grade identity check.

### 5.2 Browse Feed (`/home`)
Matches wireframe screen 2. Components:
- **Cluster switcher** (top-left dropdown) — shows current cluster, e.g. "Delhi Cluster: IIITD + IITD + DTU"
- **Notification bell** (top-right)
- **Search bar** with a filter icon (opens `/search` filter panel)
- **Section: "Move-Out Clearance"** — a horizontally-scrollable or grid row of listings from sellers with a moveout_date within the next 7 days, each card showing:
  - Photo (or placeholder)
  - "Vacating in N Days" badge
  - Title, price, campus abbreviation chip (e.g. "✓ IITD")
- **Category chip row** — Electronics / Monitors & Gear / Room Furniture / Study & Books (horizontally scrollable)
- **Section: "Nearby Verified Listings"** — grid of listing cards, each showing:
  - Photo
  - Price
  - Title
  - Condition tag (e.g. "Like New", "Good")
  - Distance + campus (e.g. "3.4 km · IIITD")
  - "✓ AI Fair Price" badge when asking_price falls within suggested range
- **Bottom nav:** Home / Explore / Sell (+) / Messages / Profile

### 5.3 Create Listing (`/listing/new`) — multi-step
Matches wireframe screen 3. Step 2 of 3 shown is "Pricing & Timing":
1. **Step 1 (not detailed in wireframe, infer standard pattern):** Category, title, photos (up to 3 photo upload slots shown as `+`)
   - **At least one photo slot must be a live in-app camera capture, not a gallery upload.** This is the product-verification equivalent of the person-verification ID check (§5.1) — it's meant to make it harder to list an item the seller doesn't actually possess (e.g. copy-pasting a stock photo from elsewhere).
   - An optional **"Verify with video"** action lets the seller record a short clip (max ~20s) — for electronics, prompt them to show it powering on; for other categories, a simple pan-around of the item. This populates `verification_video_url`. Purely optional, but listings with a video should visibly outrank/badge above photo-only listings in the feed, since it's a stronger trust signal.
2. **Step 2 — Pricing & Timing:**
   - Condition Checklist:
     - Functional Status — dropdown (Fully working / Partially working / For parts)
     - Cosmetic Flaws — dropdown/free text (e.g. "Minor scuffs on base")
     - Battery / Accessories Included — dropdown/free text (e.g. "Charger + HDMI cable")
   - When are you vacating your room? — date picker
   - **AI Pricing Assistant panel** (visually distinct card, see wireframe):
     - "Recommended Fair Market Range" — computed min–max, e.g. "₹4,500 – ₹5,200"
     - Caption: "Based on N recent campus sales" (see §6 for what backs this number pre-data)
     - "Sell Before Move-Out Price" — a single more-aggressive number with "Est. sale within 48 hours" caption
     - "Set Asking Price" — numeric input, seller can type any value; show a "High Liquidity" badge if seller's price is at or below the "sell fast" number
     - The panel re-runs automatically if the seller changes the move-out date or condition fields, so the suggested numbers never go stale mid-flow
3. **Step 3 (infer):** Review & confirm — surface the uploaded photo(s)/video alongside the condition checklist for a final seller self-check, then **Review & Publish Listing** CTA

### 5.4 Listing Detail (`/listing/:id`)
Matches wireframe screen 1 of the second lo-fi slide. Components:
- Photo carousel (back button, bookmark, share icons overlaid) — plays the verification video inline as the first carousel item if `verification_video_url` is present, photos follow after
- **"Seller moving out on [date] · N days left"** — dark banner, high visual priority
- Title + price
- **"✓ AI Fair Price Verified"** badge if applicable
- **"✓ Video Verified"** badge, shown only when the seller included a verification video — a visibly stronger trust signal than photo-only listings
- Seller mini-card: avatar, name, campus verification checkmark, hostel/hall
- **Condition Verification** block — structured, not free text on display:
  - Cosmetic: score or short tag (e.g. "8/10")
  - Screen/surface: short tag (e.g. "No scratches")
  - Ports/accessories: short tag (e.g. "Fully functional")
- **Safe Campus Meetup Zone** block — shows the assigned/suggested `SafeMeetupPoint` for this campus
- Sticky bottom bar: **Chat with Seller** (secondary) / **Make an Offer** (primary)

### 5.5 Chat Thread (`/messages/:conversationId`)
Matches wireframe screen 2 of the second lo-fi slide. Components:
- Header: other party's name + campus verification checkmark, close/back icon
- Sticky context line under header: listing title + price
- **System safety message**, shown once per thread: "Keep transactions safe: meet in designated campus zones during daytime." — non-dismissible or dismiss-once, admin-controlled copy
- Standard message bubbles (sent/received styling)
- **Meetup Proposal card** (can be sent as a rich message type, not free text):
  - "Propose Meetup Point & Time"
  - Chip selector pulling from that campus's `SafeMeetupPoint` list (e.g. "Library Foyer", "Hostel Gate 1", "Cafeteria")
  - Date/time picker
  - Once sent, renders as a confirmable card in-thread with the chosen point + time
- Text input + send button

**Pickup scheduling logic:** When a meetup proposal is accepted by both parties (buyer confirms), the `Conversation.status` moves to `confirmed`, and the `Listing.status` moves to `pending_pickup`. This is what "pickup scheduled automatically once a buyer commits" means operationally — it's not a separate logistics team or courier, it's a structured version of the meetup-arrangement conversation, defaulted to safe, pre-approved campus locations.

### 5.6 My Campus Hub (`/profile`)
Matches wireframe screen 3 of the second lo-fi slide. Components:
- User card: avatar, name, "✓ Verified ID" badge, campus + course/year
- Tabs: **My Active Listings** / **Saved & Offers**
- Stats row (3 stat tiles):
  - Items Relisted (count)
  - Campus Trust Score (percentage, see §7)
  - Avg Response time (e.g. "15m")
- Active listing card(s): photo, title, price, "N days left" badge, and a **"Drop Price with AI Assistant"** action — one-tap re-run of the pricing engine using the now-shorter days-remaining value, surfacing a new suggested price to accept

---

## 6. Pricing Engine (Rule-Based — Not ML in v1)

This is the single most important piece of product logic; per the pitch deck, it is the thing the whole MVP exists to test. Keep it transparent and explainable — no black-box model in v1.

**Inputs:**
- `category` (used to select a base-value heuristic or comparable set)
- `condition_functional_status`, `condition_cosmetic_flaws` (used as a simple multiplier/deduction)
- `days_until_moveout` (the core lever)
- Optional: a manually-maintained lookup table of recent comparable sale prices per category/cluster, seeded manually pre-launch (this is what "based on N recent campus sales" should point to — even if N is small or seeded by the team initially, don't fabricate a count in the UI beyond what's real)

**Output:** two numbers.
1. **Fair Market Range (min–max):** a wider band representing a normal, patient-sale price.
2. **Sell-Fast Price (single number):** below the range's minimum, scaled down as `days_until_moveout` shrinks. This is the number the deck's Slide 10 hypothesis is actually testing — whether sellers accept this number without countering.

**Suggested formula shape** (tune constants with real data as it comes in):
```
fair_min = base_value * condition_multiplier * 0.85
fair_max = base_value * condition_multiplier * 1.05
urgency_factor = clamp(days_until_moveout / 21, 0.6, 1.0)   // floors at 60% of fair_min when very close to move-out
sell_fast_price = fair_min * urgency_factor
```
`base_value` should come from the seeded comparable-sales table per category, not be invented per-listing. If no comparable exists yet for a category/cluster, fall back to a manually-set category default and flag the listing internally as "unpriced category" for the team to review.

**Instrumentation requirement (ties directly to the pitch deck's Measure stage):** every listing must log whether the seller's final `asking_price` equals the `sell_fast_price` (accepted without countering), falls within the fair range, or is set above/below both. This is the raw data the 50%-acceptance hypothesis is measured against — build this logging from day one, don't bolt it on later.

---

## 7. Trust Score (Campus Trust Score)

Shown on the profile hub as a percentage. For v1, keep this simple and non-gameable:
```
trust_score = 100
  - (flagged_listings_count * 15)
  - (cancelled_confirmed_meetups_count * 10)
  + (completed_transactions_count, capped bonus of +10 total)
```
Floor at 0, cap at 100. This is a heuristic, not a claim of statistical rigor — do not present it to users as more precise than it is (avoid decimals, avoid implying it's ML-derived).

---

## 8. Trust & Safety Controls (Non-Negotiable for v1)

These map directly to the "Trust and Safety" problem identified in the pitch deck's Seller/Buyer Problems slides, and should not be cut for speed:

1. **Campus-domain email match AND college-ID photo/video review are both mandatory** before any listing, chat, or offer action is possible (§5.1). Treat these as two independent gates, not one — a user who passes the email check but hasn't cleared ID review must stay blocked.
2. **Meetup locations must be selected from a pre-approved list per campus** (`SafeMeetupPoint`), not free-typed. Admins seed this list before a campus goes live.
3. **A persistent safety message** appears at the top of every new chat thread (see §5.5).
4. **No in-app payment handling** — this is explicitly out of scope, and the UI should never imply otherwise. Cash/UPI exchange happens at the in-person meetup, off-platform.
5. **Report/flag mechanism** on both listings and chat threads, routed to an admin queue (basic MVP: a flagged-items table an admin can view manually; no automated moderation needed for v1).
6. **ID review queue is an operational dependency, not just a feature.** Every new signup adds a manual review task. Before launch, someone on the team needs to own this queue and a realistic turnaround time (the §5.1 UI promises "usually within 24 hours" — don't ship that copy unless it's true). If review capacity can't keep up with signups, this becomes the actual bottleneck on growth, not the product itself.

---

## 9. Cross-Campus Logic (Scope Note)

Per your instruction, cross-campus is in scope for the build, even though the pitch deck marks it as deferred. Practically, this means:

- Browsing and search are scoped to the **Cluster**, not a single campus — a user at IIITD sees listings from IITD and DTU too if they share a cluster.
- Listing cards must always show which specific campus a listing belongs to (the small campus-abbreviation chip in the wireframe, e.g. "✓ IITD").
- Meetup points remain **campus-specific**, not cluster-wide — a cross-campus transaction requires the two parties to agree on one campus's meetup point, not a shared "cluster hub." The chat/meetup-proposal flow already handles this naturally since it's just picking from whichever campus's list makes sense for the two parties.
- No delivery/shipping mechanism is implied by "cross-campus" — it only affects *discovery*, not fulfillment. Fulfillment is still always an in-person meetup at one of the two campuses.

---

## 10. Explicit Non-Goals for This Build

State these plainly so nothing gets silently added mid-build:

- No payment processing, escrow, or in-app financial transactions of any kind.
- No real AI/ML pricing model — the pricing engine is rule-based and explainable (§6).
- No automated ID verification (no OCR, no face-match, no liveness detection) — college-ID photo/video review is done by a human admin in v1, not a machine.
- No courier/delivery logistics — "pickup scheduling" means coordinating an in-person meetup, not shipping.
- No multi-cluster (city-to-city) discovery — a user only ever sees their own assigned cluster.

---

## 11. Suggested Build Order



This order front-loads the pricing engine and listing creation because that's what the pitch deck's core hypothesis is actually testing — everything else exists to get a listing in front of a buyer and capture whether the price was accepted.
