# ADR 0092 — Fees by clinician cadre: an override on a flat base, quoted once and kept

**Status:** Accepted — product-owner decision (2026-09-19)

**Builds on** [ADR 0087](0087-capacity-modes.md) (which shipped `service_lines.payment_posture`, `fee_ugx`,
`deposit_ugx` as posture columns with no engine behind them), [ADR 0088](0088-gate-c-booking-flow.md),
[ADR 0090](0090-gate-e-notifications-waitlist-cancellation.md). Inputs: PRD §0, §8, §3.3.4;
`docs/booking-app-gate-a-proposal.md` §5.10, Part 8 #8/#14; `docs/booking-app-build/GATE-G-BUILD.md`.

## Context

The owner ruled that a facility must be able to set fees that depend on the cadre of the clinician the
patient sees. Before designing it, the question "how does Uganda actually price a consultation?" was
researched, because a Mulago beachhead inherits Mulago's rules. The findings changed the shape of the
answer without changing the ruling.

### What the research found

- **Uganda has a binding national framework, and cadre is not in it.** The Ministry of Health's _Guidelines
  for Management of Private Healthcare Services in Health Units_ (signed by the Minister and the PS;
  "come into effect on 1st July 2025 and are binding to all hospitals"; they "supersede any earlier
  communication about the pricing of private healthcare services in health units at all levels") price
  private care in public units as a DRG/APG case-mix weight × a base rate. The base rate varies on three
  axes — geography (KCCA / other cities / municipal and town councils / rural), facility level
  (specialised and national referral → community), and service class (Basic / VIP / VVIP / Executive
  Suite). Annex I gives, for a specialised/national referral hospital in KCCA, outpatient base rates of
  UGX 70,000 / 100,000 / 150,000 / 300,000 by class. **Clinician cadre is never an input.** A facility may
  set rates below Annex I with board approval, and above it only with the Minister's written approval.
- **Mulago's own flagship prices flat.** Presenting the Specialised Women and Neonatal Hospital's charges
  to Parliament (19 Sep 2018), the Health Minister stated that clinical services are "offered to all
  patients at all levels irrespective of pay" — the class buys accommodation and non-clinical amenities,
  not a more senior clinician. Standard consultation: UGX 50,000 per visit, whoever sees you. The one cadre
  split in a Ugandan public price list is "nurse care" vs "doctor care" as **inpatient per-night** line
  items — two rungs, not ten, and not on consultation.
- **A displayed price list is an obligation, not a risk.** MoH §3.4.2: "Health units shall develop and
  display a price list for the services offered." §2.2(J) makes waiving fees for those who cannot afford
  them a management **duty**. §2.2(I) reserves base-rate revision to the Minister.
- **A patient-facing fee is legally an advertisement.** UMDPC Code of Professional Ethics 2019 §4 names
  websites and mobile apps; §5(d) forbids implying one practitioner is better qualified than another in the
  same field; §5(f) and §10(l) make discounts, free services, time-limited offers and promotional prices a
  disciplinary matter for the facility and the clinician. Everything cited binds UMDPC — doctors and
  dentists. Clinical Officers, Nurses, Midwives and Pharmacists sit under the AHPC, UNMC and the Pharmacy
  Council, whose fee and advertising rules were **not** read.
- **User fees in the general wing were abolished on 1 March 2001**; fees remain in private wings, which the
  2025 guidelines now require every public hospital to run. The same building has a free pathway and a
  priced one.

## Decision

### Rulings

- **Cadre pricing is an override, not the model.** `service_lines.fee_ugx` stays the base; a sparse
  `service_line_fees(service_line_id, cadre_id, fee_ugx)` overrides it per cadre. Resolution is
  `COALESCE(override, base)` — `resolveFee()` in `_shared/fees.ts`, one copy for Deno, Next and Expo. A
  facility that prices the Ugandan way inserts nothing and behaves exactly as before. The ruling is
  honoured; non-compliance is not the default. No service-class axis, no geography axis, no case-mix: the
  posture columns were a sketch (ADR 0087) and this keeps them one, deliberately small.
- **The fee is information. MedSync charges nothing.** PRD §0 stands: MedSync "does NOT sell appointment
  times" (C2). No `payment_intents`, no `payment_state`, no provider, no webhook. Payments remain deferred
  on Part 8 #8/#14 (legal) and on the owner's billing pause. Every fee line carries two sentences that are
  not optional: "You pay at the hospital, not in the app." and "Waivers may apply — ask at the desk."
- **A quote is a snapshot, never a pointer.** `appointments.quoted_fee_ugx / quoted_fee_label /
quoted_fee_at` are written once, by `_shared/book.ts` alone — the rule `arrival_window_start/end` already
  follows — and every surface that shows money for an existing booking reads them. A facility editing a
  fee changes what future bookings are told. A test asserts exactly one writer, and that no surface joins
  back to the line. `NULL` means no fee was quoted; that is a different fact from zero, and a CHECK keeps
  a quote complete (number + instant) or absent.
- **The T‑12h case dissolves rather than being guessed.** `book.ts` refuses a clinic day with no clinician
  (409), so at the instant booking is allowed the cadre is known and the quote is one number. A day with no
  clinician is not bookable on any surface (this gate fixed two surfaces that offered it anyway) and shows
  a **range** over the base and the line's overrides, "depending on which clinician you see" — collapsing
  to one number wherever they agree, which is the Ugandan norm. A range is shown only where an exact price
  is genuinely unknowable; silence about money is what this design exists to stop.
- **Equity, enforced by test.** The fee is never a sort key, a filter or a badge: a price-sorted picker
  steers poor patients away from seniority and sick ones into under-buying it. Ordering stays
  continuity-then-soonest (PRD §2.7). The label beside a number is the cadre's registered name, verbatim,
  or the line's; the fee module may not contain "premium", "discount", "offer", "cheapest",
  "recommended" or their kin, and a test greps for them.
- **Writes are the console's, through one function.** `ha-set-service-line-fee` (hospital_admin at the
  hospital or superadmin; audited `set_service_line_fee` with before/after, fail-closed; refuses an
  override on a free line; clinical cadres only). `service_line_fees` is readable by any signed-in user —
  a price a patient may be asked to pay is a price they may read — and has no client write policy.

### The schema (migration 0063, GATED)

`service_line_fees` (UNIQUE (line, cadre); `cadre_id` ON DELETE RESTRICT — a cadre that prices something
cannot be deleted out from under a published list; `fee_ugx` ≥ 0 and ≤ 10,000,000, since Annex I's highest
figure is 3,000,000 and ten million is a typo); `appointments.quoted_fee_ugx / quoted_fee_label /
quoted_fee_at` with a completeness CHECK; `sa_audit_log` CHECKs re-issued, adding the action
`set_service_line_fee` and the target kind `service_line_fee`. Dry-run BEGIN/ROLLBACK: clean. Sequencing:
**0063 before the redeployed booking core and its callers** — `book.ts` now writes the quote columns.

### Surfaces

The fee appears wherever the reference design prints a price and wherever a patient is about to commit or
has committed, on both platforms: the category tile; the provider/doctor/clinic screens before the booking
control; the receipt (the quoted number, as told). The console's line editor gains a "Fees by cadre"
panel whose copy states the default plainly.

## Consequences

- A facility can express cadre pricing in two rows. Most will express nothing, correctly.
- A held booking's price cannot move. A facility that changes its schedule honours what it said.
- The reports seed (Gate H) can sum quoted fees per line and cadre without a join to a schedule that has
  since changed.
- A bill in a public private wing is genuinely case-mix-dependent under MoH rules; the copy says "charges",
  never "total" or "price of your visit", and a facility whose bill moves after arrival should set the
  consultation line only. Residual risk: a facility enters a number that reads as a total — an onboarding
  conversation, not a code change.
- The non-doctor cadres are a regulatory blind spot. The schema permits a fee row for any clinical cadre;
  that is deference to the ruling, not a finding that the AHPC, UNMC or Pharmacy Council permit it.
- The patient-facing fee surface should be cleared with UMDPC before the beachhead advertises it (§13(c)
  gives the Council final say over acceptable content).

## Alternatives considered

- **Cadre as the model** (a fee per cadre, no flat base). Rejected: it makes the compliant, common case the
  one that needs configuration, and contradicts the framework Mulago operates under.
- **The service-class axis** (Basic / VIP / VVIP / Executive Suite), which is what MoH actually mandates and
  what Mulago will expect to configure. Not built now; nothing in this design precludes adding
  `service_class` as a second override dimension later, and that is the recommended next step if the
  beachhead asks for it.
- **A price history table with effective dating.** Rejected: the only stability a patient can perceive is
  their own quote, which the snapshot gives; `sa_audit_log` already records who changed what and why.
- **Hiding the console field until payments exist.** Rejected in favour of stating the fee: MoH §3.4.2
  obliges a displayed price list, and a fee-required line booking in silence — the state before this
  gate — was the dishonest option.
