# Pharmacy Phase 1 — GATE A annex: wireframes

Annex to the GATE A proposal. Every screen in Section 5 of
[PROMPT-PHARMACY-PHASE-1.md](PROMPT-PHARMACY-PHASE-1.md), drawn at desktop (1440 px) as it will be built, with
the differences listed in 5.14 drawn **as built**, not as the canvas shows them. Names follow
[gate-a-brief.md](gate-a-brief.md); Step 0 facts come from [STOP-REPORTS.md](STOP-REPORTS.md). Every string is
`draft` unless it is one of the six Phase 0 strings signed on 11 Oct 2026.

## How to read these drawings

- **Fixtures only.** Patient Nine-9 (MS-2026-00009), Patient Four-4 (MS-2026-00021), TEST HOSPITAL-1, Fixture point
  A (serves the window), Fixture point B (serves the wards), Fixture tablet A, Fixture tablet B, Fixture capsule C,
  Fixture injection D (controlled), Batch FX-001 to FX-004. Strengths are written `S1`, `S2`; directions are
  `[directions as written]`; phone numbers are `{phone}`. No figure is clinical; stock counts are invented.
- **Marks.** `[Button]` is a teal button (`components/ui/button`). `[Link]` underlined is a text link. `(•)` / `( )`
  is a radio, `[x]` / `[ ]` a checkbox, `[____]` a field, `[… ▾]` a select. `▲ word` is the amber caution pair
  (`status-caution-bg` / `status-caution-fg-aa`) with its icon and always a word. `◷` is the clock icon on an amber
  chip. A plain `‹word›` is a neutral tag (`Pill` / `Tag`, cool hue or slate). `~~text~~` is struck through and
  announced as "Replaced:" or "Reversed:" (Section 10).
- **Never drawn:** red, green, a left-edge bar, a side sheet or drawer. Every pop-up is a centred `EditorDialog`
  (`medium` for short forms, `wide` for side-by-side panels), drawn with a double border `╔═╗`.
- **Reused components.** `WorkspaceShell` and the pharmacy nav registry (Phase 0), `PageHeader`, `TabList`,
  `DataTable`, `StatusWord`, `CautionNotice`, `PharmacyNotice`, `EditorDialog`, `Pill`/`Tag`, `print-layout.tsx`
  (A4 print CSS, used here for A4 and A5), the prescribing dialog (`prescribe-dialog.tsx`), `MarGrid`.
- **Permissions** are the Appendix A map version 2 (unsigned); "review" means `pharmacy.review`, and so on.

---

## 1. Shell, acting point and navigation (5.1, D-PH1-45)

```
┌─────────────────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ TEST HOSPITAL-1         │ Pharmacy / Queue          Pharmacist · [Fixture point A ▾]  Switch account  Sign out │
│ Pharmacy                ├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ │                                                                              │
│ │ ⌕ Find a prescription│ │ (page)                                                                       │
│ └─────────────────────┘ │                                                                              │
│ PHARMACY                │                                                                              │
│ ▣ Queue              14 │ ← grape tint, edge and text; never a left bar                                │
│ ◷ Open lines          5 │                                                                              │
│ ✓ Supplied today     86 │                                                                              │
│ ▤ Stock                 │                                                                              │
│ ⚿ Controlled drugs      │                                                                              │
│ ⇣ Downtime entry      2 │                                                                              │
│ ∿ Emergency doses     7 │                                                                              │
│ (avatar) User · MFA AAL2│                                                                              │
└─────────────────────────┴──────────────────────────────────────────────────────────────────────────────┘

Acting-point chooser (opens as a menu under the top-bar control; never a sheet):
  Working at
  (•) Fixture point A · Live
  ( ) Fixture point B · Not live: read-only queue and stock set-up
  Your choice is stored on everything you record.
```

- **Reads:** `requirePharmacyScope` extended to return every pharmacy affiliation (Q8 gap; D-PH1-45). The choice is
  a per-user cookie, re-checked against the affiliations on every write (PA2-4) and stored on every event. A viewer
  with one point sees its name as plain text, no chooser.
- **Who:** the approved cadre in sentence case (`sentenceCase`), never "Pharmacist" for a Pharmacy technician.
- **Nav items** register through `lib/pharmacy/nav.ts`; each shows only when its flag is on, its page is built and
  the viewer holds `pharmacy.view` (PA2-4 list). At a point that is not live: Queue (Phase 0 read-only view),
  Stock (with `pharmacyDispensing`, set-up and opening count), Emergency doses. A point switched off keeps Open lines
  (RD-3). Downtime entry needs `pharmacyDowntime`.
- **Counts** are neutral: Queue = prescriptions in scope without an outcome; Open lines = open outcomes; Supplied
  today = hand-overs at this point today; Downtime entry = sheets `to_enter`.
- **Find a prescription** replaces Phase 0's "Find by patient number": a MedSync number, a prescription number or a
  slip code (LB-6). An earlier prescription opens in the Phase 0 view with one action, **[Bring into the queue]**
  (`bringIntoQueue`, dispense), and the line _"Written before this pharmacy began recording in MedSync."_
- **Phone (390 px):** the sidebar becomes the Phase 0 link row under the top bar; the point chooser stays in the
  top bar, truncated to the point name.

## 2. Queue (artboard 1.1, 5.2)

```
Queue                                                                         Updated 10:42  [Refresh]
▲ MedSync does not check drug interactions at this hospital, and 4 of the 192 medicines on its list have a
  signed dose reference. Check each prescription yourself.                        (PharmacyNotice, CK-1/2)
[Pharmacist first 4] [Standard 10] [All 14]                         [Fixture point A ▾]
[All stages] [To review 2] [Queried 1] [Ready to hand over 0] [Awaiting co-sign 1]
┌──────────────────────┬─────────────────────────┬──────────────────┬───────────────┬────────┬──────────┬─────────┐
│ Patient              │ Medicines               │ Why a pharmacist │ Stage         │ Waiting│ Payment  │         │
│                      │                         │ first            │               │        │          │         │
├──────────────────────┼─────────────────────────┼──────────────────┼───────────────┼────────┼──────────┼─────────┤
│ Patient Nine-9       │ Fixture tablet A,       │ ▲ Stop overridden│ To review     │ 50 min │ Paid     │[Review] │
│ MS-2026-00009        │ Fixture tablet B, +1    │ ‹Renal check›    │               │        │          │         │
│ Diabetes clinic · MO │ 3 lines · 1 not on the  │                  │               │        │          │         │
│                      │ shelf                   │                  │               │        │          │         │
│ Patient Four-4       │ Fixture capsule C       │ ‹Child check›    │ ◷ ▲ Awaiting  │ 37 min │ Not      │ [Open]  │
│ MS-2026-00021        │ 1 line · on the shelf   │                  │   co-sign     │        │ recorded │ Cannot  │
│ Outpatients · CO     │                         │                  │               │        │          │ be      │
│                      │                         │                  │               │        │          │ supplied│
│                      │                         │                  │               │        │          │ yet     │
│ Patient Six-6        │ Fixture tablet B        │ ‹Controlled›     │ Queried ·     │ 22 min │ Exempt   │[Review] │
│ MS-2026-00031        │ 1 line · stock not      │                  │ 12 min        │        │          │         │
│ Outpatients · MO     │ counted                 │                  │               │        │          │         │
├──────────────────────┴─────────────────────────┴──────────────────┴───────────────┴────────┴──────────┴─────────┤
│ ── Written before today, still without an outcome ──────────────────────────────────────────────────────────────│
│ Patient Two-2 · MS-2026-00002 · Fixture tablet A · To review · 3 days         [Open] [Close as not collected] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
4 of 14 at Fixture point A, pharmacist first. Waiting starts when the prescription was written. A prescription
leaves the queue only with a recorded outcome for every line.

How the lanes work
A prescription goes to "Pharmacist first" when the prescriber overrode a stop, it has a controlled drug, the
child check or the renal check fired, or a pre-set dose was changed. Everything else is "Standard". The list of
reasons is signed by the Clinical Safety Officer.
This hospital has no signed high-risk list, so that reason is not used.
```

**No lane rule signed (LN-4):** the lane tabs collapse to one, `[All 14]`, the "Why a pharmacist first" column
stays, and the explainer reads only: _"This hospital has not signed its review rule, so every prescription needs a
pharmacist."_

- **Reads:** `getPharmacyQueue` (extended `computeQueue`) → lanes from `lib/pharmacy/lanes.ts` (LN-1 to LN-7), stages
  from `lib/pharmacy/lines.ts` (LO-1, least advanced line shown), stock summary from `getAvailability` (AV-3, no
  quantity), payment from the last `setPaymentStatus` (SU-12). Period filter removed (5.1); scope is LO-6.
- **Lane tabs** and **stage filter** are `TabList`s with counts in their accessible names (Section 10). Lane counts
  ignore the lane filter and add up to All; stage counts are within lane and point.
- **Reason chips:** up to two, most serious first, then `+n`; an overridden stop is `▲ Stop overridden`, others
  neutral tags. Reasons read stored facts only (LN-3; Q7 mapping). The "signed high-risk list" reason is off: none
  exists (Q7, D-PH1-29). "Typed dose with no signed reference" is off (D-PH1-04).
- **Control:** `[Review]` for a holder of `pharmacy.review`, or of `pharmacy.dispense` in the Standard lane;
  `[Open]` otherwise. A co-sign prescription has `[Open]` plus _"Cannot be supplied yet"_.
- **Changed since printing** is **not drawn**: no print of the doctor's prescription is recorded (Q20, PQ-7). The chip
  appears only once that print logs a `pharmacy_print_events`-style event (see "Open points" at the end).
- **Waiting:** server clock, minutes, no colour, no threshold (E-PH1-11). A 30-second tick updates clocks; rows
  refresh on the `user:<id>` / workspace event or **[Refresh]**.
- **Earlier and still open:** under the divider, with age in days; **[Close as not collected]** opens the dialog in
  §7.4. Nothing drops off by time (LO-5).
- **Empty:** _"Nothing waits at Fixture point A. Every prescription in scope has an outcome."_ (draft). **Not live:**
  the Phase 0 queue, unchanged, with its signed notice.

## 3. Review and supply (artboard 1.2, 5.3)

### 3.1 Pharmacist, pharmacist-first prescription

```
← Queue
Patient Nine-9 · MS-2026-00009 · F · [age words]            Weight [v] ([date]) · Creatinine [v] ([date])
Allergies: [as recorded] ([date])                           Payment: Paid  [Set]
Pharmacist first: ▲ Stop overridden  ‹Renal check›          Diabetes clinic · Medical officer · 09:52
▲ MedSync does not check drug interactions at this hospital, and 1 of these 3 doses has a signed reference.
  Check each line yourself.
┌───────────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│ 1  Fixture tablet A, tablet, S1        For: [problem]          │ Checks that came with it                 │
│    [directions as written]                    Stage: To review │ Allergy · Stop · overridden              │
│    ▲ Allergy stop, overridden by the prescriber.               │ Kidney · Check · "[answer]"              │
│      Reasons given: "[reason, verbatim]".                      │ Stock · the prescriber was told it was   │
│    The prescriber was told: on the shelf at Fixture point A.   │   on the shelf                           │
│    On the shelf here: 120 · counted 12 Oct 08:10               │ Not checked: drug interactions           │
│    Batch, first to expire: FX-001 · exp 03/2027  [Change]      │                                          │
│    [Reason accepted, supply]   [Ask the prescriber]            │ Ask the prescriber                       │
│    Decision ( ) Supply in full  qty [____] tablets             │ (form opens here, §4.1)                  │
│             ( ) Supply part     ( ) Not on the shelf           │                                          │
│             ( ) Ask the prescriber                             │                                          │
│    Days this supply covers (optional) [___]                    │                                          │
├───────────────────────────────────────────────────────────────┤                                          │
│ 2  Fixture tablet B, tablet, S2        For: [problem]          │                                          │
│    [directions as written]                    Stage: To review │                                          │
│    On the shelf here: 0 · out since 09 Oct                     │                                          │
│    Elsewhere in the hospital: Fixture point B                  │                                          │
│    Decision ( ) Supply in full ( ) Supply part (•) Not on the  │                                          │
│             shelf ( ) Ask the prescriber      → opens §5       │                                          │
├───────────────────────────────────────────────────────────────┤                                          │
│ 3  Fixture capsule C, capsule, S1      For: [problem]          │                                          │
│    [directions as written]                    Stage: To review │                                          │
│    On the shelf here: Not counted yet.                         │                                          │
│    [Accept the remaining lines]   (takes line 3: no reason)    │                                          │
└───────────────────────────────────────────────────────────────┴──────────────────────────────────────────┘
A pharmacist may change the pack or strength only when the dose and the form the patient takes stay the same.
Any other change goes back to the prescriber.
1 of 3 lines have an outcome. Each supply takes its quantity from the batch shown, in the same step.
                                         [Save and keep in the queue]  [Continue to hand-over]
```

- **Reads:** `getReview` → `buildPrescriptionView` (Phase 0 read list, R4; the open is logged), lane and reasons
  (LN-2), stage per line (LO-1), the prescriber's stored stock answer from `pharmacy_stock_answers` (D-PH1-44, AV-8),
  shelf and batch from the ledger (`balance`, SL-2; first expiry SU-3; expired excluded SL-5), elsewhere (AV-5).
- **Acceptance first (LN-2, RQ-1):** the decision radios on a line with a lane reason stay disabled until
  **[Accept this line]** or, for an overridden stop, **[Reason accepted, supply]** (`accepted_overridden_stop`).
  **[Accept the remaining lines]** takes reason-less lines in one tap (`acceptRemainingLines`).
- **Quantity:** never pre-filled. No prescription line carries a structured quantity (Q3, SU-6, D-PH1-15), so
  "Supply in full" is never pre-selected and the dispenser types one quantity per line. The field's accessible
  name is "Fixture tablet A, quantity in tablets".
- **Supply part** reveals: supplied now `[__]`, not supplied `[__]`, the rest `( ) owed ( ) the patient buys it
outside` (SU-7). "Buys it outside" is absent on a controlled line (CD-4).
- **Decline to supply** appears only on a line whose current version has had a query (LO-7): `[Decline to supply]`
  → centred `medium` dialog: coded reason, note, what the patient will read (Patient, declined wording).
- **Supply without a pharmacist** (D-PH1-05): absent while the hospital setting is off (default). When on, a holder
  of `pharmacy.dispense` sees `[Supply without a pharmacist]` with a signed reason list; never on a controlled
  line. There is no presence signal (Q21), so it is not hidden when a pharmacist is on shift.
- **Footer buttons:** `saveLineDecisions` stages decisions and moves no stock; **[Continue to hand-over]** is enabled
  when at least one line is to be supplied and each other line has a decision, an outcome or an open query.
- **Inpatient (D-PH1-02 off):** ward prescriptions show no decision radios, only acceptance and query, with _"Ward
  doses come from ward stock, which MedSync does not count yet."_ Acceptance writes `reviewed` (LO-6).
- **Refused / not live:** at a point that is not live the page is the Phase 0 read-only view. A co-sign line shows
  the co-sign caution and no decision (`awaiting_cosign`, LO-4).

### 3.2 Pharmacy technician, the same prescription

```
1  Fixture tablet A, tablet, S1                                         Stage: To review
   [directions as written]
   ▲ Allergy stop, overridden by the prescriber. Reasons given: "[reason, verbatim]".
   On the shelf here: 120 · counted 12 Oct 08:10 · Batch FX-001 · exp 03/2027
   Waiting for a pharmacist                                             [Ask the prescriber]
```

- A viewer without `pharmacy.review` sees every line of a pharmacist-first prescription read-only with _"Waiting
  for a pharmacist"_ (Appendix B). They may still query (`sendQuery`: dispense or review) and set payment. Once a
  pharmacist has accepted a line, its decision radios open for the technician (Appendix A: dispense on accepted
  lines). The header never names a technician as a pharmacist.

### 3.3 A line changed by the prescriber while open (RQ-9)

```
1  ~~Fixture tablet A, tablet, S1 · [old directions as written]~~        ‹Replaced›
   Fixture tablet A was changed by the prescriber at 10:31. Review it again.
1a Fixture tablet A, tablet, S1 · [new directions as written]           Stage: To review
   Already supplied on an earlier version: 14 tablets, 11 Oct.
   [Accept this line]
```

- Pushed by the realtime event (D-PH1-47) or found on save; any acceptance or staged decision on the old version no
  longer counts in either lane. The strike-through is announced "Replaced:". **Depends on D-PH1-41**: without the
  new `cancelPrescriptionLine`, the only change that reaches here is a co-sign withdrawal (Q4).

### 3.4 Choosing the product and the batch (5.3.1) — `EditorDialog`, `wide`

```
╔════════════════════════════════════════════════════════════════════════════════════════════╗
║ Fixture tablet A, tablet, S1 · product and batch                                       ✕   ║
╟────────────────────────────────────────────┬───────────────────────────────────────────────╢
║ Product                                    │ Batch (first to expire is chosen)             ║
║ (•) Fixture tablet A, pack of 100 · 120    │ (•) FX-001 · exp 03/2027 · 80 on the shelf    ║
║ ( ) Fixture tablet A, pack of 28  · 0      │ (•) FX-002 · exp 09/2027 · 40   ← split row   ║
║ Different strength (pharmacist only)       │ Choosing another batch needs a reason:        ║
║ Not offered: no signed substitution rule.  │ [Reason ▾]                                    ║
║                                            │ ▲ Expired FX-000 · 08/2026. Expired 31 Aug    ║
║                                            │   2026. Remove it from the shelf.             ║
║                                            │ [Add a batch found on the shelf]              ║
╟────────────────────────────────────────────┴───────────────────────────────────────────────╢
║                                                           [Cancel]  [Use these]            ║
╚════════════════════════════════════════════════════════════════════════════════════════════╝
```

- **Products** at this point for the prescribed catalogue id (CT-2, CT-6); one with stock is pre-selected. A
  different pack needs no reason. **A different strength** appears only once the signed substitution rule allows
  it; then it needs `pharmacy.review`, a coded reason and the pharmacist's line (80 characters), shown beside the
  prescribed directions with one confirmation (SU-8). See "Open points" on how a strength is found.
- **Batch:** FEFO with a proposed split in expiry order, one row each (SU-3). Expired batches are listed, never
  offered (SL-5). **[Add a batch found on the shelf]** (`addBatchFoundOnShelf`, stock) asks batch, expiry, quantity
  counted and reason; with no product here it adds one first, tagged ‹Added at the window›. With no product:
  _"No product is set up for this medicine at Fixture point A."_ (CT-6).

## 4. Ask the prescriber, and the answer (artboards 1.2 and 1.10, 5.4)

### 4.1 The query form (right column of §3.1; a region with a heading, focus moves into it)

```
Ask the prescriber
About        (•) Line 1: Fixture tablet A     ( ) The whole prescription
Type         [Dose needs checking ▾]          (signed query codes, Appendix D; "Other" needs text)
What you propose  [________________________________________________]  0 / 500
[x] The patient is waiting at the window
Who will be told: Medical officer · Diabetes clinic (prescriber)
                  Senior medical officer · Diabetes clinic (responsible clinician)
                                                                   [Cancel]  [Send query]

After sending, on the line:   Query sent 10:44 · not answered          [Log a phone answer] [Withdraw]
If delivery failed:           ▲ The prescriber has NOT been told. Call them and log the call.
If nobody resolves:           ▲ Nobody can be told in MedSync. Call the ward or clinic.
```

- **Reads/writes:** recipients resolved at send and stored (RQ-3: prescriber + `encounters.clinician_user_id` if
  different, Q16); `sendQuery` (dispense or review) writes `pharmacy_queries` + `created` + `notified` events and
  publishes `{kind, ref, at}` on `user:<id>` through the sibling of `private.notify_user` (D-PH1-47; no PHI). Never
  reads as "the prescriber knows"; `seen` is never shown as an answer (RQ-8). A whole-prescription query puts every
  unsupplied line at `Queried` (RQ-5).
- **Withdraw** → `medium` dialog with a reason; the line returns to To review.
- **Log a phone answer** → `medium` dialog: _Who you spoke to_ (staff search, this hospital only) · _What they said_
  `( ) keep as written, with their reason ( ) will change it ( ) stop it` · _Time_. Only "keep" from a clinician
  who may prescribe answers the query (`via: phone`, RQ-7); the others are `call_logged` and change nothing.

### 4.2 On the doctor's problem card (artboard 1.10), desktop

```
Plan (step 10)                                         ‹Plan placed›  ‹2 from the pharmacy›
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [Problem]                                                                                │
│ Fixture tablet A, tablet, S1 · [directions]  ‹Prescribed›  ‹Pharmacy query · waiting 6 min› │
│   From the pharmacy (Pharmacist), 10:44 · Dose needs checking. "[proposal, verbatim]"    │
│   The patient is waiting at the window.                                                  │
│   Your answer                                                                            │
│   ( ) Keep it as written     [Reason ▾]                                                  │
│   ( ) Change the prescription  → opens the prescribing dialog on this line               │
│   ( ) Stop this medicine       [Reason ▾]                                                │
│                                                                    [Send answer]         │
│ Fixture tablet B, tablet, S2 · [directions]   ‹Prescribed›                               │
│   From the pharmacy, 10:52. Fixture tablet B was not supplied: [reason]. [What the       │
│   patient was told].              [Choose an alternative]  [Leave it as it is]           │
│ [Prescribe something else]                                                               │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Mount points (Q15):** the chip beside the "Prescribed" tag at `problem-card.tsx:573` (and `medicines.tsx:219-236`);
  the answer form below that `<li>`; data on `PlacedRx` (`lib/clerking/plan/record.ts`, built in
  `lib/emr/read/plan.ts`); the count beside `PlanStatusPill` (`clerking-desk.tsx:1138`); the doctor workspace badge
  is a new `FlowTask` kind fed from `lib/workspace/queries.ts` (no hotkey; 0–9 are taken).
- **Delivery:** the plan step and workspace re-read on the `user:<id>` event, else every 15 s (D-PH1-47); a new query
  is announced once, politely (Section 10). Rendering writes `seen` (`recordQuerySeen`).
- **Answers (RQ-4, RQ-5):** **Keep** → `answerQuery`. **Change** and **Stop** use the **new** prescriber action
  `cancelPrescriptionLine` (D-PH1-41); "change" places the new line through the existing dialog, then cancels the
  old one, linking them on the query event (`replaced_by`). A whole-prescription query offers **Stop the remaining
  medicines**, and **Change** opens the plan step and closes with **[Changes made]** (`confirmChangesMade`). If
  D-PH1-41 is declined, Change and Stop are absent and the card says to call the pharmacy.
- **First answer wins (RQ-6):** a later attempt is shown _"Answered by [cadre] at 10:49: Keep it as written."_ and
  writes nothing.
- **Phone answer recorded:** _"The pharmacy recorded your phone answer at 10:58. Not you? Tell us."_ → `[Tell us]`
  (`disputePhoneAnswer`).
- **Call the pharmacy** is **not drawn**: there is no per-point phone on the branch (Q8). The button appears only
  once the go-live page (§13) stores a phone for the point; until then it is absent, not disabled.
- **Not supplied (RQ-11):** needs no answer; **[Leave it as it is]** writes `acknowledgeNotSupplied`.

### 4.3 The doctor's answer at 390 px, one-handed

```
┌──────────────────────────────────┐
│ Plan        ‹2 from the pharmacy›│
│ Fixture tablet A, tablet, S1     │
│ ‹Pharmacy query · waiting 6 min› │
│ From the pharmacy (Pharmacist),  │
│ 10:44 · Dose needs checking.     │
│ "[proposal, verbatim]"           │
│ The patient is waiting at the    │
│ window.                          │
│ ┌──────────────────────────────┐ │
│ │ ( ) Keep it as written       │ │  ← each answer a full-width 44 px row
│ ├──────────────────────────────┤ │
│ │ ( ) Change the prescription  │ │
│ ├──────────────────────────────┤ │
│ │ ( ) Stop this medicine       │ │
│ └──────────────────────────────┘ │
│ Reason [__________________ ▾]    │
├──────────────────────────────────┤
│ [          Send answer          ]│  ← sticky footer, thumb reach
└──────────────────────────────────┘
```

## 5. Not on the shelf (artboard 1.3) and the slip (artboard 1.8)

### 5.1 Not on the shelf (5.5) — a region under the line, with a heading; focus moves into it

```
Not on the shelf: Fixture tablet B, tablet, S2
Out since 09 Oct · 3 days.  Fixture point A: 0 · counted 12 Oct 08:10.
In stock at: Fixture point B.     Other strengths here (for your information): none set up.
What happens to this line
  ( ) Owed to the patient. The patient comes back when stock arrives. Nothing is held for them.
  ( ) The patient buys it outside. Prints the slip.
  ( ) Send for it from Fixture point B. The line is owed; Fixture point B sees the request on its Stock page.
  ( ) Return to the prescriber for an alternative. Sends a query: "Not available, alternative needed".
Quantity not supplied (optional) [___]        Reason recorded [Out of stock ▾]
Who is told
  The prescriber, on the problem card.
  The patient: Tell the patient now. Their list will say: "The hospital pharmacy had none. Take the paper
    you were given, with your prescription, to any licensed pharmacy."
  SMS is off at this hospital.
  The pharmacy in charge: This stock-out has turned away 4 prescriptions since 09 Oct.
A line that is not supplied always carries a reason and a next step. It never closes on its own.
                                                              [Cancel]  [Record and print]
```

- **Reads:** stock-out projection (`pharmacy_stockouts`, SL-9), `balance`, AV-5 for other points. "Send for it"
  shows only when another live point holds it, writes a `pharmacy_stock_requests` row (SL-7; not a workflow of its
  own, 5.14). "Return to the prescriber" creates the query (§4.1).
- **Writes:** `recordNotSupplied` (dispense; refused on a pharmacist-first line without acceptance), outcome
  `owed` / `buying_outside` (LO-4) with what the patient was told (LO-8); `printSlip` logs to `pharmacy_print_events`.
- **Controlled line:** "buys it outside" is absent, with _"A controlled drug cannot be sent to another pharmacy on
  this form. Return it to the prescriber, or record it as owed."_
- **Who is told** varies with flags: with `pharmacyPatientList` off and SMS off: _"No message is sent. The patient
  knows only what you tell them."_; a patient with no app and no number: the list says so (5.11).

### 5.2 The slip (A5, print CSS only, black on white)

```
┌──────────────────────────────────────────────────────────┐
│ TEST HOSPITAL-1 · Fixture point A · [district]           │
│ Medicine not supplied: to fill at another pharmacy       │
│ Prescription [number, if any] · 12 Oct 2026              │
│ Patient: Patient Nine-9 · MS-2026-00009 · F · [age]      │
│──────────────────────────────────────────────────────────│
│ Fixture tablet B (generic), tablet, S2                   │
│ [directions as written]                                  │
│ Quantity: as on the prescription                         │
│ Written by generic name.                                 │
│──────────────────────────────────────────────────────────│
│ Prescriber: [name] · Medical officer · [council] [number]│
│──────────────────────────────────────────────────────────│
│ For the supplying pharmacy                               │
│ Name and stamp ____________________                      │
│ Quantity supplied ______   Date ______                   │
│──────────────────────────────────────────────────────────│
│ This medicine was not available at the hospital pharmacy │
│ today. Give this to the pharmacy together with your      │
│ signed prescription.                                     │
│ To check this is real, call the hospital pharmacy on     │
│ {phone} and give this code: K7QF-MN3P.                   │
│ Controlled drugs are never printed on this form. Printed │
│ 10:53 at Fixture point A. Copy 1 of 1.                   │
└──────────────────────────────────────────────────────────┘
```

- **As built (5.14):** titled _"Medicine not supplied: to fill at another pharmacy"_; **no prescriber signature
  box**: the D-PH1-13 line stands in its place. Only `buying_outside` lines, never a controlled one (LB-5).
- **Prescriber name and council number** print here only (D-PH1-37), from `clinician_profiles.registration_number`
  and its council; screens keep the cadre.
- **Address:** the hub holds no street address, only `district` (Q8), so the head prints hospital, point and
  district. **{phone}** needs a point phone (§13); see "Open points".
- **Code:** random, ≥ 8 characters, unambiguous alphabet, no patient data (LB-6). _"The prescription was changed on
  {date}. Ask the hospital for a new copy."_ prints only if a print of the prescription is on record (not today).

## 6. Hand-over (artboard 1.4, 5.6)

```
Hand-over · Patient Nine-9 · MS-2026-00009 · F · [age]        Reviewed by Pharmacist · 10:46
1  Confirm who is at the window
   Collected by  (•) The patient   ( ) Someone else: name [________] relationship [________]
   First   [x] They said the patient's full name, and it matches.
   Second  Date of birth or phone number on file, as the person says it   [______________]  [Check]
           ✓ Matches.     |  This does not match. Check you have the right patient. (attempt 2 of 5)
   Two identifiers are needed before the hand-over can be recorded. Ask the person to say them; do not read
   them out.
   [Identified another way]  → ( ) The card or prescription with the patient's number was shown
                               ( ) Known to staff   ( ) Other: [note]
2  Supplying now
   Medicine                     Quantity   Batch · expiry          Outcome
   Fixture tablet A, tablet, S1  14         FX-001 · 03/2027        Supplied
   Fixture capsule C, capsule   10         FX-003 · 01/2027        Supplied
                                 4          FX-004 · 05/2027        (second batch: its own label)
   Fixture tablet B, tablet, S2  —          —                       Owed (stays under Open lines)
   Labels at this point: Printed.       [Print labels]  → preview of 3 labels (§14)
     Printing failed?  [Write them by hand instead]
   Additional instructions  [ ] [signed line 1]  [ ] [signed line 2]
3  Explained   [ ] [signed counselling point 1]  [ ] [signed counselling point 2]   Language [English ▾]
4  Payment status  (•) Paid  receipt ref [______]  ( ) Exempt [reason ▾]  ( ) Insured [scheme]
                   ( ) Emergency  ( ) Not recorded
When you record it
   28 tablets leave FX-001 and FX-003 / FX-004 as listed. Fixture tablet B stays under Open lines (owed).
   Patient Nine-9's medicine list gets 2 medicines; 1 gets a refill date (days covered typed).
                                                                [Back]  [Record hand-over]
```

- **Second identifier, as built (5.14):** the date of birth or phone on file, typed and compared on the server
  (`checkSecondIdentifier`; SQL date compare, `blindIndex(typed) = phone_hmac` with a decrypt fallback, Q17). The
  MedSync number and a tick list are **not** offered. No stored value reaches the client or assistive technology.
  Every attempt is logged in `pharmacy_identity_attempts`; after five wrong ones the field closes for this
  hand-over and only **Identified another way** remains (`recordIdentifiedAnotherWay`, listed for the in-charge).
- **Label mode, as built (5.14):** a setting of the point (`label_mode`, D-PH1-17). At a hand-written point section
  2 shows `[ ] I have written the label on each envelope.` instead of **[Print labels]**. A failed print can switch
  this hand-over to hand-written; that is recorded.
- **Head line:** _"Reviewed by {cadre} · {time}"_ / _"Standard lane: checked at supply"_ / _"Supplied without a
  pharmacist: {reason}. A pharmacist will look at this supply."_
- **Payment** section shows only where the hospital uses it; "Not recorded" is refused where required; Emergency
  never (SU-12).
- **Record hand-over** → `recordHandover`, one transaction under line and batch locks (SU-1, SU-2). Refusals, nothing
  written: _"Batch FX-001 now holds 6. Choose again."_ · _"Fixture tablet A was already supplied at Fixture point B,
  10:51."_ · _"Fixture tablet A was changed by the prescriber at 10:50. Review it again."_ A double tap returns the
  same hand-over (SU-10).
- **After recording:** each line's outcome in words (Supplied · Owed · …), never a bare "Done". A message or print
  failure after commit is said in words and undoes nothing (SU-13).

## 7. Open lines (1.7), Supplied today, look-back, reverse and correct (5.7)

### 7.1 Open lines

```
Open lines                                                           Fixture point A
[All 5] [Owed 3] [Buying outside 2]
Patient               Medicine                          Outcome         Reason         Open since
Patient Nine-9        Fixture tablet B, tablet, S2      Owed            Out of stock   12 Oct · today
MS-2026-00009         14 supplied 12 Oct, rest owed                                    [Supply now] [Tell the patient it is here]
                                                                                       [Change to buying outside] [Close]
Patient Seven-7       Fixture capsule C, capsule        Buying outside  Out of stock   08 Oct · 4 days
MS-2026-00044         Slip printed 08 Oct 11:02                                        [Confirm filled] [Change to owed] [Close]
                      ▲ The patient could not get it
Patient Eight-8       Fixture tablet A, tablet, S1      Buying outside  Out of stock   07 Oct · 5 days
MS-2026-00051         The patient says they bought it (closed)
Nothing leaves this list without a person's action.                         (explainer, signed wording)
```

- **As built (5.14):** **no "With the prescriber" tab.** A line returned to the prescriber is a query and stays in
  the queue under Queried.
- **Reads:** `getOpenLines` (outcomes `owed`, `buying_outside`, LO-2). **[Supply now]** only when on the shelf here
  (opens §6 for that line); **[Tell the patient it is here]** only when on the shelf and a message can go
  (`notifyOwedInStock`, MS-4). **[Close]** / **[Confirm filled]** → `medium` dialogs with a coded reason / who said so.
- **Switched-off point:** this page stays (RD-3); Supply now is absent there.

### 7.2 Supplied today and the look-back tab

```
Supplied today                                 [Print the day's dispensing log]
[Today 86] [Look-back · 2 waiting ▲]        Filter: [ ] Identified another way
Time   Patient                 Lines and quantities            Batches          Supplied by       Reviewed by
10:58  Patient Nine-9 ·        Fixture tablet A 14;            FX-001;          Pharmacy          Pharmacist
       MS-2026-00009           Fixture capsule C 14            FX-003, FX-004   technician        10:46
                                                                          [Reprint labels] [Reverse]
09:20  Patient Three-3 · …     Fixture tablet A 10             FX-001           Pharmacist        Standard lane:
       ‹Entered after downtime› Supplied 08:40 · entered 09:20 · sheet DS-00031                    checked at supply
```

- **Look-back tab:** oldest first; each row says why (supplied without a pharmacist, RQ-12; a downtime entry with
  its DT-10 reasons; a disputed phone answer, RQ-7) with **[Looked at]** (`recordLookBack`, review, note) or
  **[Send a query]**. The tab reads _"Look-back · {n} waiting"_ with the caution icon while anything waits.
- **Reprint labels** is logged (LB-4). **Correct the record** is on a supply's detail for `pharmacy.manage` (§7.4).

### 7.3 Reverse a supply (5.7.1) — `EditorDialog`, `medium`

```
╔════════════════════════════════════════════════════════════════════╗
║ Reverse this supply                                            ✕   ║
╟────────────────────────────────────────────────────────────────────╢
║ Fixture tablet A, tablet, S1 · 14 tablets · FX-001 · 10:58          ║
║ Reason          [Handed back at the window ▾]                      ║
║ Is the pack back and fit to return to the shelf?                   ║
║ (•) Fit: 14 return to FX-001                                       ║
║ ( ) Not fit: 14 return to FX-001 and are written off, with reason  ║
║ The line returns to where it stood before this hand-over. The      ║
║ prescriber is told, and the entry leaves the patient's list.       ║
╟────────────────────────────────────────────────────────────────────╢
║                                         [Cancel]  [Reverse]        ║
╚════════════════════════════════════════════════════════════════════╝
```

- `reverseSupply`: manage or review; controlled also needs `pharmacy.controlled` and a witness (the witness block
  of §9 inside this dialog). Offered only on the hospital-local day recorded (SU-11). Afterwards the row reads
  _"Reversed 11:05 by Pharmacist: Handed back at the window"_, struck through, announced "Reversed:".

### 7.4 Correct the record, and close as not collected — `EditorDialog`, `medium`

```
╔══════════════════════════════════════════════════════╗   ╔══════════════════════════════════════════════════╗
║ Mark as recorded in error                       ✕    ║   ║ Close as not collected                       ✕   ║
║ Reason [Wrong patient ▾]   Note [______________]     ║   ║ Patient Two-2 · written 09 Oct · 3 lines         ║
║ No stock moves: put the shelf right with a count.    ║   ║ Reason [Not collected ▾]  Note (optional) [____] ║
║ The entry leaves the patient's list and the line     ║   ║ The prescriber sees this at the patient's next   ║
║ returns to where it stood before this hand-over.     ║   ║ visit.                                           ║
║                         [Cancel] [Mark in error]     ║   ║                          [Cancel] [Close]        ║
╚══════════════════════════════════════════════════════╝   ╚══════════════════════════════════════════════════╝
```

- `correctSupplyRecord` (manage, SU-14) → _"Recorded in error. {reason}"_; `closePrescriptionNotCollected`
  (dispense, LO-4).

## 8. Stock at the dispensing point (artboard 1.6, 5.8)

### 8.1 Stock page

```
Stock · Fixture point A                [Receive stock] [Count] [Send to another point] [Add a product]
Requests from other points: Fixture point B asks for Fixture tablet B · 20 · for a line   [Send] [Close]
┌──────────────────────┬──────────────────────┬──────────────────────┐
│ Out of stock now  3  │ Expiring within 90 d │ Counted this week    │
│ (vital: not imported)│ 2 batches            │ 41 of 58             │
└──────────────────────┴──────────────────────┴──────────────────────┘
Opening count: 6 products still need one before this point can go live.
[All 58] [Out 3] [Low 4] [Expiring 2] [Not counted this week 17]
Medicine                      On the shelf  First batch to expire   Counted        State              Last 7 days
Fixture tablet A, tablet, S1  120           FX-001 · 03/2027        12 Oct 08:10   In stock           96
Fixture tablet B, tablet, S2  0             —                       12 Oct 08:10   ▲ Out · 3 days     40
Fixture capsule C, capsule    14            FX-003 · 01/2027        05 Oct         ▲ Expiring · 81 d  22
Fixture syrup E, bottle       -4            FX-007 · 06/2027        never          ▲ Count needed     6
"Low" means under the reorder level the pharmacy set for this medicine here. A medicine with no level is never
shown as low.
```

- **Reads:** `getStock` → balances from the ledger (SL-2), stock-outs (SL-9), reorder levels (D-PH1-23), look-ahead
  (operational setting). National-list class only once imported (CT-3); until then the vital count says so.
- **Who:** `pharmacy.stock` acts; other pharmacy staff read only (buttons absent). Works with `pharmacyDispensing` on,
  live or not (PA2-4).
- **Controlled before Step 7:** a controlled product cannot be added or received: _"Controlled drugs are set up in
  the next step."_ After Step 7 every action on one goes through the witness block (§9).
- **Detail (as built):** a row opens a page, `/pharmacy/stock/{medicine}`, not a side panel (ADR 0161): products
  and batches (batch · expires · on the shelf), today's movements (time · what · quantity · batch · source · who),
  then **[Set reorder level]** (manage) · **[Adjust]** · **[Correct batch details]** (manage).

### 8.2 Receive, count, adjust, transfer, correct — each a centred `EditorDialog`

```
╔═══════════════════════════════════════════╗  ╔══════════════════════════════════════════════════╗
║ Receive stock                        ✕    ║  ║ Count · Fixture tablet A                     ✕   ║
║ Product [Fixture tablet A, pack 100 ▾]    ║  ║ Type what is on the shelf, batch by batch.       ║
║ Batch number [FX-005]  Expiry [03/2028]   ║  ║ FX-001 · exp 03/2027   on the shelf [____]       ║
║ Quantity [100] tablets                    ║  ║ FX-002 · exp 09/2027   on the shelf [____]       ║
║ From (•) Main store ( ) A supplier        ║  ║ [Add a batch not listed]                         ║
║      ( ) Borrowed from another facility   ║  ║                       [Cancel] [Save count]      ║
║      ( ) Returned from a ward             ║  ║ ── after saving ──                               ║
║ Delivery reference (optional) [______]    ║  ║ FX-001: Counted 80 · matched the record          ║
║ ▲ FX-001 is already here with expiry      ║  ║ FX-002: ▲ Counted 36 · the record said 40.       ║
║   03/2027, not 03/2028. Check the label.  ║  ║   Reason [Damaged ▾]  [Record the correction]    ║
║                   [Cancel] [Add to stock] ║  ╚══════════════════════════════════════════════════╝
╚═══════════════════════════════════════════╝
╔═══════════════════════════════════════════╗  ╔══════════════════════════════════════════════════╗
║ Adjust · Fixture tablet A            ✕    ║  ║ Send to another point                        ✕   ║
║ Batch [FX-001 ▾]  Quantity [-2]           ║  ║ Product [▾] Batch [FX-001 ▾] Quantity [20]       ║
║ Reason (•) Damaged ( ) Expired, removed   ║  ║ To [Fixture point B ▾]  For request [▾ optional] ║
║   ( ) Lost ( ) Found on the shelf         ║  ║ Both movements are recorded together.            ║
║   ( ) Other: [text]                       ║  ║                         [Cancel] [Send]          ║
║                    [Cancel] [Adjust]      ║  ╚══════════════════════════════════════════════════╝
╚═══════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════╗
║ Correct batch details · FX-001                           ✕    ║
║ Batch number  FX-001 → [FX-0011]   Expiry 03/2027 → [03/2027] ║
║ Reason [Mistyped at receipt ▾]                                ║
║ The old value stays in the record. Movements are unchanged.   ║
║                                    [Cancel] [Correct]         ║
╚═══════════════════════════════════════════════════════════════╝
```

- **Blind count, as built (5.14):** the expected figure is **not** shown before saving (SL-6, D-PH1-24); the canvas's
  "expected" column is not built. A match records _"Counted {n} · matched the record"_; a difference shows both
  figures only after save and writes a `count_correction` in the same transaction.
- **Receive:** a batch number already here with a different expiry is refused with both shown (SL-3).
- **Actions:** `receiveStock`, `recordCount`, `adjustStock`, `transferStock` (both movements, SL-7), `addProduct`
  (stock); `correctBatchDetails` (manage, `batch_corrected`, SL-11); `setProductPrice` (manage). Issue unit locks
  after the first movement (CT-4).

## 9. Controlled drugs (artboard 1.5, 5.9)

### 9.1 The controlled supply screen (replaces §6 for any hand-over with a controlled line)

```
Controlled supply · Patient Nine-9 · MS-2026-00009 · F · [age] · Outpatients
Prescribed by Medical officer · witnessed at prescribing          Controlled drug   (no signed class)
▲ MedSync's record does not replace the paper. Keep the signed prescription and make the entry in the
  hospital's controlled drugs register, as you do today.
Fixture injection D, injection, S1 · [directions as written] · to supply [2] ampoules · FX-010
1  The witness
   Witness  [Choose your name ▾]  (staff allowed to witness; never you)
   Password [••••••••]   Authenticator code [______]                     [Confirm the witness]
   ✓ Witnessed by Pharmacy technician · 11:12  (password + authenticator)
2  The count, batch by batch (with the witness present)
   FX-010 · exp 02/2027   In the cupboard before [__]                    [Check the count]
   ── after Check the count ──
   FX-010   You counted 9 · MedSync's figure 9 · ✓ matches
            Supplying 2   In the cupboard after 7
   (or)     ▲ You counted 8 · MedSync's figure 9. The count does not match the record. Record the
            difference; it goes to the pharmacy in charge.         Supply continues from 8.
3  Paper that still applies
   [ ] The signed prescription is here, matches what is on this screen, and will be kept.
   [ ] The entry is made in the controlled drugs register, and the person collecting has signed it.
   [Print the register entry]   → "Copy for the controlled drugs register. This is not the register."
4  The witness agrees
   [ ] I, the witness, saw the count and agree with the balance of 7.
5–8  Who is at the window · Labels · Explained · Payment   (the §6 sections, unchanged)
                                                                    [Back]  [Record supply]  (off until 1–4)
```

- **Witness first, as built (D-PH1-42, CD-3):** `lib/auth/attest.ts` checks the witness's password and TOTP on a
  throwaway client that never touches the supplier's session; it records `witness_user_id`, `method =
'password+totp'`, `attested_at` in `pharmacy_attestations`. Five failures lock the attestation for this action.
  The witness list is PA2-6 (proposed: any holder of `pharmacy.dispense`); the supplier is never offered.
- **Count committed, then figure, as built (5.14):** the typed figure is written as a witnessed count event
  (`recordControlledCount`) **before** MedSync's balance is returned; it cannot be retyped. A difference writes a
  `controlled_difference` and a witnessed `count_correction`.
- **Reached** only after a pharmacist accepted every line (CD-2); `recordControlledSupply` records all lines,
  controlled and not, in one transaction. "Changed since printing" would sit in the head (CD-8) but cannot be
  computed today (Q20).
- **"Witnessed at prescribing"** reads the prescribing witness, which today is a typed name with no proof (Q9); the
  head says so in words rather than naming a person.
- **Class:** shown only from signed data (CT-7, D-PH1-28); the 8 draft `controlled` flags (Q6) put a line on this path
  but name no class.

### 9.2 The Controlled drugs page

```
Controlled drugs · Fixture point A          Medicine [Fixture injection D ▾]   [Count now] [Receive] [Print entries]
Open differences:  11 Oct 16:02 · FX-010 · counted 8, record 9 · Pharmacist + Pharmacy technician   [Close with a note]
Entered after downtime, to confirm against the register:  1                                   [Confirm (witnessed)]
Time          What                  In   Out  Balance  Batch   By                  Witness
12 Oct 11:14  Supplied · Nine-9      —    2    7       FX-010  Pharmacist          Pharmacy technician
12 Oct 11:13  Counted (witnessed)    —    —    9       FX-010  Pharmacist          Pharmacy technician
11 Oct 16:02  Count correction       —    1    9       FX-010  Pharmacist          Pharmacy technician
10 Oct 09:00  Received · Main store  10   —    10      FX-010  Pharmacist          Pharmacist (2nd)
```

- `getControlledRegister`; the running balance equals `balance()` on every row (CD-6). Count now and Receive use the
  same witness block. `closeControlledDifference` (manage). Back-entered rows confirmed by
  `confirmBackEnteredControlledSupply` with a witness (DT-8).

## 10. Prescriber's stock line (artboard 1.10, 5.10) and the nurse's chip

### 10.1 In the prescribing dialog's Check step (behind `pharmacyStockAnswer`)

```
Check
Will read     [Fixture tablet B, tablet, S2 · directions as typed]
Pharmacy      Not on the shelf at Fixture point A since 09 Oct. In stock at Fixture point B.
              Check   ( ) Aware; prescribe anyway   ( ) Pick something else
              Stock informs and never blocks. A dispensing point that has not counted says so.
Checks        Allergy · …
```

- **Mount:** replaces the static "Pharmacy not linked yet" field (`prescribe-dialog.tsx:992-996`); the drug list's
  `PHARMACY_WORD` (`:578`) reads the same seam. `getAvailability` (AV-1 to AV-9) returns no quantity.
- **Other states:** _"On the shelf at Fixture point A. Counted 12 Oct 08:10."_ / _"Received 12 Oct 07:30, not yet
  counted."_ (Note) · _"Low at Fixture point A. Counted …"_ (Note) · _"Not stocked at Fixture point A."_ (Check) ·
  _"Stock at Fixture point A has not been counted yet. This answer may be wrong."_ (Note) · _"Pharmacy not linked
  yet"_ (no live point). Levels per D-PH1-22; never a Stop; placing always works.
- **Stored:** a Check answer goes in `check_answers` (code `stock`) with the prescriber's reason; every shown answer
  also goes to `pharmacy_stock_answers` in the placement transaction (D-PH1-44). No column on `prescriptions`.

### 10.2 The nurse's administration record (MarGrid row header)

```
Prescription                                   Due times
Fixture tablet A, tablet, S1                   08:00 ‹Given 08:05›   14:00 ‹Due›
[detail]  ‹Pharmacy: reviewed 10:46›
Fixture capsule C, capsule                     12:00 ‹Due›
[detail]  ▲ Pharmacy: query with the prescriber
Fixture tablet B, tablet, S2                   …
[detail]  ‹Pharmacy: standard lane, not reviewed›
```

- **Mount (Q14):** the row header in `mar-grid.tsx:43-51`, on the nurse patient page (`nurse-monitoring.tsx:70`,
  behind `clerkingPlanV2LiveFor`) and the doctor's plan step. `/nurse/mar` is freehand and gets no chip.
- **Reads:** `getLineReviewState` returns the review state and nothing else (PA2-5). Read-only; never holds a dose.
  Cool tags for the workflow words; amber only for the query.

## 11. Patient medicine list (artboard 1.11) and messages (artboard 1.12)

### 11.1 `/patient/track/medications`, web (behind `pharmacyPatientList`), at 390 px

```
┌──────────────────────────────────┐
│ My medicines                     │
│ From TEST HOSPITAL-1 pharmacy,   │
│ 12 Oct 2026.                     │
│ ┌──────────────────────────────┐ │
│ │ Fixture tablet A, tablet, S1 │ │
│ │ [directions as written]      │ │
│ │ 14 tablets given today       │ │
│ │ Next supply due around       │ │
│ │ 26 Oct 2026                  │ │
│ ├──────────────────────────────┤ │
│ │ Fixture capsule C, capsule   │ │
│ │ [directions as written]      │ │
│ │ From the pharmacist: [line]  │ │
│ │ 14 capsules given today      │ │
│ ├──────────────────────────────┤ │
│ │ Fixture tablet B, tablet, S2 │ │
│ │ Not given today              │ │
│ │ The hospital pharmacy had    │ │
│ │ none. Take the paper you     │ │
│ │ were given, with your        │ │
│ │ prescription, to any         │ │
│ │ licensed pharmacy.           │ │
│ │ [I have bought it]           │ │
│ │ [I could not get it]         │ │
│ └──────────────────────────────┘ │
│ (Emergency affordance as today)  │
└──────────────────────────────────┘
```

- **Web only, as built (5.14):** the existing responsive page, not a phone app (Q13). Push is not built.
- **Reads/writes:** supplied lines through `selfMedicationFromPrescription` into `self_medications` (one row per
  prescription, ML-1); refill only from typed days or a structured duration supplied in full (ML-3); taps
  `reportBoughtOutside` / `reportCouldNotGet` (ML-4). "One entry per line, however many batches."
- **"Ask about my medicines"** is **absent**: no patient contact route exists (`/patient/care` lists "Messages from
  your care team" as coming).
- **Empty / flag off:** today's self-tracking page, unchanged.

### 11.2 The three messages, as rendered (SMS; the in-app text is the same)

```
Owed:            MedSync: one of your medicines was not available at {hospital message name} today. Call the
                 pharmacy on {phone} to ask when it has arrived.
Buying outside:  MedSync: one of your medicines was not available at {hospital message name} today. Keep the
                 paper you were given, or call the pharmacy on {phone}.
In stock today:  A medicine the pharmacy owed you is in stock at {hospital message name} today.
```

- **As built (5.14):** the hospital's **message name** only, never the point, a medicine, a condition, a clinic or a
  prescriber; "in stock today", never "ready to collect" (MS-1, D-PH1-39). Templates live in the generalised
  `ncd_sms_template` (D-PH1-48), two approvers, banned-term scan (MS-2). SMS off by default. The third is sent only
  by **[Tell the patient it is here]** (MS-4).

## 12. Downtime (artboard 1.9) and the dispensing log (5.12)

### 12.1 The sheet (A4, print CSS, black on white)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ DOWNTIME DISPENSING SHEET   DS-00031          TEST HOSPITAL-1 · Fixture point A              │
│ Date ________   Downtime started ____:____                                    Page 1 of 1    │
│ SUPPLIES                                                                                      │
│ # │Time │Patient name and number│Medicine, form, strength│Qty│Batch │Prescription│IDs ✓│Pharm. │By│
│ 1 │     │                       │                        │   │      │            │ [ ] │init.  │  │
│ … (rows 1–15)                                                                                 │
│ NOT SUPPLIED                                                                                  │
│ # │Time │Patient │Medicine │Why │Owed / buy outside                                          │
│ … (rows 1–6)                                                                                  │
│ ENTRY INTO MEDSYNC   Entered by ________  Signature ________  Date and time ________          │
│ Write each time as it happened. MedSync keeps that time and marks the record "Entered after   │
│ downtime". Controlled drugs also go in the register as usual.                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Print blank sheets** → `reserveSheetNumbers` (dispense) reserves a run in the shared `downtime_form_numbers`
  (`workspace = 'pharmacy'`, one number space per hospital, shown `DS-`, D-PH1-46). Supply columns follow the
  hospital's Daily Dispensing Log once its column map is confirmed (DL-1).

### 12.2 Downtime entry

```
Downtime entry · 2 sheets to enter                 [Record a downtime] (manage)   [Record a drill]
Sheet [DS-00031 ▾]  · to enter · rows entered 3 of 7
Row [4]   Patient [MS-2026-00009 ▾]  Patient Nine-9
          Prescription (•) [12 Oct 09:52 · Diabetes clinic ▾]   ( ) A paper prescription
          Product [Fixture tablet A, pack 100 ▾]  Batch [FX-001 ▾]  Quantity [14]
          Time supplied, from the sheet [13:40]   Supplied by [Pharmacy technician ▾]
          Identity tick on the sheet (•) Checked ( ) Not checked ( ) Not recorded
          Pharmacist's initials [__]
Saved as: supplied 13:40, entered 14:52.
                                      [Save row]  [Save and next row]  [Sheet complete]
Refusals: "Ask the pharmacy in charge to record this downtime first." · "Register this patient at reception
first." · "Row 4 of DS-00031 is already entered."
```

- **Writes:** `enterDowntimeRow` through `recordHandover`'s transaction with `entered_after_downtime` (DT-3); a paper
  prescription opens fields for prescriber name and cadre as written, the date and each line typed, tagged
  _"Transcribed from a paper prescription by {cadre}"_ (DT-5, `paper_prescriptions`). A controlled row also takes
  the witness's name as written and the register tick (DT-8). Nothing already handed over is refused; DT-10
  reasons go to look-back. A batch may go below zero; it then shows ▲ Count needed (DT-7).
- **Record a downtime** (`recordDowntime`, manage) and **Record a drill** (`recordDrill`, writes nothing else) are
  `medium` dialogs. Behind `pharmacyDowntime`.

### 12.3 The daily dispensing log (print, from Supplied today)

```
DAILY DISPENSING LOG · TEST HOSPITAL-1 · Fixture point A · 12 Oct 2026                Page 1 of 2
Columns not yet confirmed against this hospital's dispensing log.
# │ Time  │ Patient · number          │ Medicine, form, strength     │ Qty │ Batch  │ By
1 │ 08:40 │ Patient Three-3 · …00003  │ Fixture tablet A, tablet, S1 │ 10  │ FX-001 │ PT  (entered after downtime)
2 │ 10:58 │ Patient Nine-9 · …00009   │ Fixture capsule C, capsule   │ 10  │ FX-003 │ PT
3 │ 10:58 │ Patient Nine-9 · …00009   │ Fixture capsule C, capsule   │ 4   │ FX-004 │ PT
4 │ ~~10:58 │ Patient Nine-9 · …00009 │ Fixture tablet A …           │ 14  │ FX-001~~ Reversed: handed back
```

- `getDispensingLog`: one row per batch supplied (DL-1), back-entered rows on their supply day (DL-2), reversed and
  in-error rows struck through with the reason; row count = supply events (DL-3). Column order is the confirmed map
  (`confirmLogColumns`, manage); until then, the line at the top.

## 13. Going live at a dispensing point (5.13, hospital admin)

```
Departments and services › Pharmacy › Fixture point A
Going live                                                      Not live · requested by —
Pharmacy phone for this point  [{phone}]  [Save]   (used by "Call the pharmacy", the slip and messages)
Label mode  (•) Printed  ( ) Written by hand on the envelope
┌───┬────────────────────────────────────────┬──────────────┬────────────────────────────────┬──────────────────┐
│   │ Condition                              │ State        │ Evidence                       │                  │
├───┼────────────────────────────────────────┼──────────────┼────────────────────────────────┼──────────────────┤
│ 1 │ The content is signed                  │ ▲ 9 of 14    │ lane rule v1 signed 12 Oct …   │ [See what is left]│
│ 2 │ Legal interim answers on record (1–6)  │ ▲ 4 of 6     │ ref LA-002, [role], 10 Oct     │ [Record an answer]│
│ 3 │ Stock set up and counted               │ ▲ 52 of 58   │ opening counts                 │ [Open Stock]     │
│ 4 │ A downtime drill recorded here         │ Met          │ drill 11 Oct, 4 people         │                  │
│ 5 │ Pharmacy and prescribers briefed       │ ▲ Pharmacy   │ briefing 11 Oct (pharmacy)     │ [Record a        │
│   │                                        │   only       │                                │  briefing]       │
│ 6 │ An in-charge named for the point       │ Met          │ Pharmacist, from 01 Oct (hub)  │                  │
└───┴────────────────────────────────────────┴──────────────┴────────────────────────────────┴──────────────────┘
[Switch on dispensing]  (opens when all six are met)

After a request:   Requested by Hospital admin · 12 Oct 15:02.  Waiting for a second approver.
Second approver:   [Approve and switch on]   [Decline, with a reason]
Live point:        Live since 13 Oct 08:00.  [Switch off]  → reason, then a second approver
```

- **Where:** the hub's existing **Dispensing points** panel on Pharmacy (`departments-view.tsx`, `DispensingPoints`),
  one page per point. No PHI on the page.
- **Reads:** `pharmacyReadiness` / `getPharmacyReadiness` (RD-1): signed sets from `pharmacy_signed_sets`, legal
  answers, opening counts, drills (`downtime_drills` with `workspace` and point, D-PH1-46), briefings, the in-charge
  as a `department_heads` row on the point's unit (brief).
- **Two-person switch (RD-2, RD-3):** `requestGoLive` → `approveGoLive` by a different user, modelled on the lab's
  `lab_cutover` second approver (0105); one audited transaction stamps `live_at`. A second point also shows a 7th
  row, _"A note on how the first point's pilot went"_, written by someone other than the requester (RD-5).
- **Settings** on the same page (`updatePharmacySettings`): the point's phone and label mode; on the hospital's
  Pharmacy page: inpatient supply, payment status required, supply without a pharmacist (second approver and legal
  answer 1), live SMS and the message name (RD-4).

## 14. The label (one per batch supplied, LB-1)

```
┌────────────────────────────────────────────────┐
│ Patient Nine-9                     12 Oct 2026 │
│ Fixture capsule C (generic), capsule, S1       │
│ [directions as written, byte for byte]         │
│ From the pharmacist: [line, if any]            │
│ Quantity 10 capsules                           │
│ Batch FX-003 · Exp 01/2027                     │
│ [signed additional instruction, if chosen]     │
│ Keep out of the reach of children.             │
│ Fixture point A · TEST HOSPITAL-1 · [district] │
└────────────────────────────────────────────────┘
(a second label for the same line: Quantity 4 capsules · Batch FX-004 · Exp 05/2027)
```

- One label per supply event (one batch); fields and order are what GATE A signs (D-PH1-17). Directions byte for
  byte; no plain-words line ships (D-PH1-18). The address line prints the district: the hub holds no street address
  (Q8). Print CSS only; print and reprint logged, no PHI in a file name or URL (LB-4). At a hand-written point no
  label prints; the attestation is recorded instead.

---

## Differences from the canvas, as built

| 5.14 difference                                                                                 | Drawn in                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| "Typed dose with no signed reference" is not a lane reason; reasons per hospital                | §2 explainer and reason chips; no high-risk list line        |
| Slip titled "Medicine not supplied: to fill at another pharmacy", no signature box              | §5.2                                                         |
| Open lines has no "With the prescriber" tab; returned lines stay in the queue as Queried        | §7.1, §2 stage filter                                        |
| "Send for it from another point" is a request plus a two-movement transfer                      | §5.1, §8.1 (requests at the top), §8.2 Send to another point |
| Second identifier is the typed date of birth or phone, not the MedSync number or a tick list    | §6 section 1                                                 |
| Label mode is a setting of the point; labels are not always printed                             | §6 section 2, §13, §14                                       |
| Controlled: witness first, count typed and committed, then MedSync's figure                     | §9.1                                                         |
| Stock count is blind; no expected figure beside it                                              | §8.2 Count                                                   |
| Messages name the hospital's message name only, and say "in stock today"                        | §11.2                                                        |
| Reverse, correct the record, decline, close as not collected, days covered, look-back are built | §7.3, §7.4, §3.1, §2, §3.1, §7.2                             |
| Patient screens are the responsive web pages; push not built                                    | §11.1                                                        |
| Answer reasons on 1.10 are a signed list                                                        | §4.2 `[Reason ▾]`                                            |
| Every medicine, quantity, batch, price and phone is an example                                  | throughout (fixtures; no price shown anywhere)               |

## Tablet (834 px) and phone (390 px)

| Screen                          | 834 px (tablet at the window)                                                                   | 390 px                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Shell                           | Link row under the top bar (as Phase 0); point chooser in the top bar                           | Same; chooser shows the point name, truncated                           |
| Queue                           | Table keeps Patient, Medicines, Stage, Waiting, control; reasons and payment fold under Patient | Each row three lines (Phase 0 pattern); tabs scroll sideways            |
| Review and supply               | One column: checks and the query form move under the lines                                      | One column; decision radios full-width 44 px rows; footer buttons stack |
| Product and batch dialog        | `wide` dialog stacks its two panels                                                             | Dialog full width, panels stacked, body scrolls (≤ 88svh)               |
| Query form                      | Under the lines                                                                                 | Under the line it is about                                              |
| Doctor's answer                 | Problem card as desktop                                                                         | Answers stack; **Send answer** in a sticky footer, one-handed (§4.3)    |
| Not on the shelf                | Region under the line                                                                           | Same; choices as full-width rows                                        |
| Hand-over                       | Supplying table keeps four columns; checked target for S56                                      | Supplying table becomes one card per line; Record hand-over sticky      |
| Open lines, Supplied today      | Actions wrap under the row                                                                      | Cards; actions as a row of buttons under each                           |
| Stock and detail                | Figures in one row; table drops "Last 7 days"                                                   | Figures stack; table becomes cards; dialogs full width                  |
| Controlled supply               | One column, sections in order 1 to 8                                                            | Supported but not a target (a controlled supply at a phone is unlikely) |
| Prescribing stock line          | Inside the existing dialog's layout                                                             | Inside the existing dialog's layout                                     |
| Nurse MAR chip                  | Wraps under the row label                                                                       | Wraps under the row label                                               |
| Patient list and messages       | Centred column                                                                                  | Drawn at 390 px (§11.1)                                                 |
| Downtime entry                  | Fields in two columns                                                                           | One column                                                              |
| Going live                      | Table scrolls inside its card                                                                   | Each condition a card                                                   |
| Paper (slip, sheet, label, log) | Print only                                                                                      | Print only                                                              |

## Open points found while drawing (prompt and repo disagree)

1. **No phone for a point.** "Call the pharmacy", the slip's verification line and the owed / buying-outside
   messages all need `{phone}`; the hub has only `hospitals.emergency_phone` (Q8). Drawn as a field on the go-live
   page (§13); the call button is absent until it is set. **To decide:** whether the slip and messages may render
   without it, or whether a phone joins condition 1's evidence.
2. **No street address.** The label and slip ask for the hospital's address; only `district` exists (Q8). Drawn with
   the district.
3. **"Changed since printing" cannot be computed.** The doctor's prescription print records no print event (Q20,
   R17); the chip is drawn nowhere until it does. Also R17: that print includes cancelled and completed lines.
4. **Change and Stop depend on D-PH1-41.** No prescriber cancel exists (Q4). Without it §3.3 arises only from a co-sign
   withdrawal, and §4.2 offers Keep only.
5. **"Supply in full" is never pre-selected and the quantity never pre-filled**: no structured quantity exists (Q3,
   SU-6). The 8-interaction budget always takes the "one typed quantity per line more" branch.
6. **A "different strength" has no source.** The catalogue has no strength field (Q6), so "other strengths here"
   (5.5) and the strength substitution (5.3.1) cannot be listed without a signed mapping between catalogue ids;
   drawn as "not offered" / "none set up".
7. **No presence signal** (Q21): "Supply without a pharmacist" is not hidden when a pharmacist is on shift.
8. **The nurse chip mounts on `MarGrid`, which no app code fills** (`emr_prescription_id` unwritten, Q14), and
   `/nurse/mar` is freehand. The chip will show only where MAR rows exist.
9. **The patient list's store is one row per prescription** (`self_medications.source_prescription_id` unique,
   Q13). A part supply and its later remainder share one entry; "Not given today" lines are better read from
   `pharmacy_line_events` than written into `self_medications`, where they would look like medicines to take.
   The "group per hand-over" is read-side.
10. **No patient contact route**: "Ask about my medicines" is absent.
11. **Two co-sign wordings.** Phase 0's signed caution reads "Not yet co-signed. A senior has not signed this
    prescription."; Appendix B's queue string reads "Cannot be supplied yet. A senior has not signed this
    prescription." The second is new and `draft`.
12. **The stock "detail panel"** is drawn as its own page, not a side panel (ADR 0161).
13. **Query delivery** uses `user:<id>` (D-PH1-47, lab 0106 now merged), not STOP 0's interim `workspace:<hospital>`
    plan.
