# ADR 0460 — A hospital's own prices: payers, charge modes, rules that propose, prices from a date

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 8, under GATE A signed by Fadhul, CSO). Migration 0257
(GATED, owner-applied after 0256).

## Context

Each product had one `price_ugx` column, edited in place: no payer, no date, no history, and a blank read as
nothing at all. The supply already snapshots `price_ugx` (0126), but from that column. GATE A §7 sets the price
model: Laws 10–14, D-CAT-10 (no price rule shipped) and D-CAT-11 (pay before collecting per point, off by default).

## Decision

1. **Hospital-scoped tables, append-only history.** `pharmacy_payers`, `pharmacy_point_charge_modes`,
   `pharmacy_point_pay_first`, `pharmacy_price_rules`, `pharmacy_product_prices`, and supplier price lists
   (`pharmacy_price_lists`, `_lines`, filled by Step 9). RLS gives each to `pharmacy.view` at its own hospital
   (S32); the shared catalogue holds no price. Modes, pay-first, rules and prices are append-only: a change is a new
   row from a date, from today or later (Law 12).
2. **Three kinds of nothing (Law 11).** A price is an integer above 0, or the row is `free`. No price in force is
   "Price not set", never UGX 0 (`ppp_price_or_free`; the engine's `chargeFor`).
3. **A rule only proposes (S26).** `proposePrice` = last received unit cost × markup × payer adjustment, rounded
   up to the step, returned with its arithmetic. Accepting re-works the proposal on the server and keeps the
   arithmetic as the price's `basis`; the screen's figure is never trusted. No rule ships (D-CAT-10).
4. **The price in force** on a date is the latest row from on or before it; a later entry wins a same-day tie (S27).
5. **The supply snapshot** takes the cash price in force at the point (free at a free point) and records
   `price_kind` and `payer_id` beside `price_ugx`. The old price edit also writes a cash price from today.
6. **Pay before collecting is per point** (D-CAT-11): with no row, the hospital's `payment_status_required` stands,
   so nothing changes on apply. An emergency and an admitted patient always pass (Law 13): `paymentPasses` gains
   the admitted exemption, from the prescription's origin. Downtime entry never checked payment and still does not.
7. **Stock value** (S31) = Σ balance × the batch's quantity-weighted mean received cost (a cost correction replaces
   its receipt's cost; a moved batch keeps its cost by product and batch number). A batch with stock and no cost is
   named, never valued at zero.
8. **Copy-in.** 0257 copies each `price_ugx` above 0 as a cash, typed price from its last update date. The column
   stays; a zero is not copied.

## Consequences

- Everything sits behind `PHARMACY_CATALOGUE`; with it off the supply, payment and price paths are unchanged.
- The admitted exemption is applied only where the flag is on, with the rest of this slice.
- Scheme and staff prices are typed or accepted per payer; the supply snapshot uses cash until a payer is chosen at
  hand-over, which belongs to the payment slice.
