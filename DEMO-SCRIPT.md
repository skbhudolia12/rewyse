# Dobara demo: setup and shot list

Three people, one sale, end to end: a seller lists an item and the AI prices it,
a buyer negotiates and pays into escrow, Dobara delivers it, and operations pays
the seller out. Every screen updates live, so all three panels can be on screen at once.

## Before recording (once)

1. Restore the Supabase project if it was paused (Dashboard → project → Restore).
2. `npm run db:migrate` to apply migrations, including `0009_commerce.sql`.
3. `npm run eval:pricing`. All items must pass. Read `demo-assets/model-answers.json`:
   that is what the AI will say on camera.
4. Product photos for the seeded feed are already in `demo-assets/listings/`
   (public-domain or credited in `CREDITS.md`). Swap any for your own by keeping the file name.
5. Have a photo and a 10–15 second video of the item you will list on camera
   (the Dell monitor below) on the recording laptop.
6. Record from a production build: `npm run build && npm start`.

## Before every take

```bash
npm run seed:demo                      # wipes and re-seeds: same feed, same answers, every take
npm run demo:login -- --as seller      # open in Chrome profile 1
npm run demo:login -- --as buyer       # open in Chrome profile 2
npm run demo:login -- --as ops         # open in Chrome profile 3
```

Links are single use. Re-run a command for a fresh one.

| Panel | Who | Campus |
|---|---|---|
| Seller | Rohit Mehra, moves out in 5 days | IIITD |
| Buyer | Ananya Rao | IITD (cross-campus delivery) |
| Operations | Kabir Sethi, admin | — |

## Type exactly this when listing on camera

The AI's answer for this item was reviewed and frozen. Any other text is a new,
unreviewed model call.

| Field | Text |
|---|---|
| Title | `Dell 24" IPS monitor P2419H` |
| Category | Electronics |
| Does it work? | Fully working |
| Visible wear | `Minor scuffs on the stand` |
| What's included | `Power cable and HDMI cable` |
| Description | `Bought in 2023 for my room. No dead pixels and the stand adjusts fully.` |

The mini fridge and the study chair are frozen too (`tests/eval/golden-items.ts`),
if you would rather list one of those.

## Shot list

1. **Landing page** (signed-out window). The quick-sale price drops as move-out gets closer.
2. **Seller: list the monitor.** Sell → Take photo → Add video → fill the fields above.
   The price check runs: what the item is, why it's worth that, and what the move-out
   date does to the price. Pick Quick sale → Publish.
3. **Seller: boost it.** On the listing → Boost listing → 7 days → X-Pay → paid.
4. **Buyer: discover it.** Home shows *Leaving campus this week* and the monitor marked
   Sponsored. Open it: gallery with the video first, condition, "How this price was set",
   and the buy box with delivery fee, ETA and escrow.
5. **Buyer: make an offer** a little under the asking price.
6. **Seller: accept it** in Messages. The buyer's thread updates live.
7. **Buyer: checkout.** Buy at the offer price → hostel and room → order summary
   (item, delivery, convenience fee) → Pay → X-Pay → UPI → success → order tracker.
8. **Operations: the business.** Admin overview: revenue split into convenience fees,
   delivery fees and boosts.
9. **Operations: delivery.** Escrow and delivery → Mark picked up → out for delivery →
   delivered. Keep the buyer's tracker on screen; it moves live.
10. **Buyer: confirm received.**
11. **Operations: pay the seller.** Release → payout reference and bank account.
12. **Seller: paid.** Orders → Your sales → Completed; Profile shows the earnings.

## If something goes wrong mid-take

Run `npm run seed:demo` and start again. Every take starts from the same state.
