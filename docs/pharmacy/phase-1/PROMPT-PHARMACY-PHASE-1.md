# PROMPT: Pharmacy Phase 1 — dispense, with stock at the window (review lanes, recorded outcomes, batch stock, hand-over, controlled drugs, the stock answer, downtime)

> **For Claude Code.** Work at the repo root on a new branch `feat/pharmacy-dispensing`, cut from the branch where `feat/pharmacy-front-door` (pharmacy Phase 0) has merged. If Phase 0 has not merged, **STOP at Step 0**: this slice depends on its pharmacy permissions, queue projection, prescription read model, navigation registration, dispensing points and `pharmacyChecksState`. First copy this prompt into `docs/pharmacy/phase-1/`.
>
> **Mode:** gated. Ten steps (0–9), each ending in a **STOP**. They are called steps because "Phase 1" already names this slice of the pharmacy roadmap.
>
> - Documents use Stage 1: draft → critique against the checklist → revise (max two passes) → present → STOP.
> - Code uses Stage 2: build → run the real checks → fix → re-run until green → report numbers → STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what earlier reads claimed and what Phase 0 was asked to leave behind. Verify every line. Build what Step 0 proves is missing; reuse what it proves exists.
>
> **The CSO is Fadhul.** This slice adds the pharmacy's first clinical write and MedSync's first stock record. Nothing in it reaches a production hospital without his signature, and that of a named pharmacist reviewer (roadmap D-PH-13), on: the permission map, the lane reasons, the outcome reasons and query codes, the substitution rule, the high-risk list, the label and counselling wording, the controlled class of each medicine, every string a patient reads, and the hazard log (Section 14, Appendices A to D).
>
> **What is the floor, and how it merges.** Steps 4 to 8 carry roadmap floor conditions 3 to 7. Step 9 (the prescriber's stock line, the ward chip, the patient's list and messages) is not part of the floor; GATE A may defer it (D-PH1-40), and the patient is then told at the window and by the paper slip. The slice merges three times and goes live once (Section 9).
>
> **Two things must exist before GATE A can be signed:** a written interim answer to legal questions 1 to 6 in Appendix E, and the name of the pharmacist reviewer. If either is missing at Step 1, say so at STOP 1 and wait.

---

## 0. What we are building, in one paragraph

After Phase 0 the pharmacy can see every prescription and can record nothing. A medicine leaves the hospital with no record of what was supplied, from which batch, by whom, or why it was not. A stock-out is said at the window and nobody upstream learns of it. The prescriber is told "Pharmacy not linked yet". This slice builds the floor a hospital pharmacy must stand on before it uses MedSync for real patients. **A prescription is reviewed in the lane its risk calls for, and every line ends in a recorded outcome. A supply names the person confirmed at the window and the batch it came from, and takes that quantity from stock in the same action.** A medicine that is not on the shelf becomes owed, bought outside or returned to the prescriber, and the prescriber and the patient are told. Controlled drugs keep their witness and their statutory paper. The prescriber sees a real stock answer while prescribing. The window can **work on paper during downtime and enter supplies afterwards with their true times**.

**Done when:** no window prescription ends without a recorded outcome for every line. Every supplied line names a batch. An out-of-stock outcome reaches the prescriber, and the patient is told what to do. The pilot dispensing point has run one downtime drill.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap and the design canvas. Report every disagreement at STOP 0.
2. **The plan:** the _MedSync Pharmacy Roadmap_, "Phase 1: Dispense, with stock at the window" and "The floor: seven conditions" (https://claude.ai/artifact/WfJbaaKpAKVdYvu1Tmpxkn). Conditions 3 to 7 of the floor are this slice.
3. **The UI reference:** the design canvas _Pharmacy UI Preview_ (https://claude.ai/artifact/QWr8hAaEyDhmEdiCbYUBTT).
   - Artboards **1.1 to 1.12** are this slice. Section 5 names the artboard for each screen.
   - Artboards 0.1 to 0.4 are Phase 0. Artboards 2.1 onward preview later phases. **Build nothing from them.**
   - The canvas is drawn in MedSync Chroma. Build with the design system in force on this branch (Law 15).
   - Every patient, medicine, strength, quantity, batch, count, price and time on the canvas is **an example and not a signed value**. Copy none of them into code or seeds. The canvas shows directions as `[placeholders]`; the product shows them as written.
   - Where this prompt and the canvas differ, this prompt wins. The known differences are listed in 5.14.
4. **Design and decisions:** `DESIGN-medsync.md` (authoritative), ADR 0097 (plum = place), ADR 0052 (prescriptions and emergency administrations), ADR 0190 (the pharmacy availability seam), and the pharmacy Phase 0 ADRs (access model, queue projection, read list, "as written", the check-state seam, dispensing points, the numbers ledger).
5. **Prompts this builds on** (read the copies under `docs/`):
   - `PROMPT-PHARMACY-PHASE-0.md`: permissions (6.1), the queue (6.3), the read model (6.4), `pharmacyChecksState` (6.6), dispensing points (6.8), the read list (D-PH0-05), what one queue row is (D-PH0-08);
   - `PROMPT-LAB-PHASE-1.md`: the append-only event pattern (6.4), "sent is not received" (Law 2), recipients (6.5), messages and the banned-term scan (6.7), downtime with form numbers and true times (6.8), readiness with a second approver (6.9), the hazard log (Appendix B);
   - `PROMPT-NCDSYNC-BUILD-v2.md`: the SMS provider interface, template statuses with two-person approval, the recall list;
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: departments, units, heads and in-charges, four-eyes, print CSS only, "informs, never blocks";
   - `PROMPT-CLERKING-DESK-V2.md` and `PROMPT-CLERKING-EXAM-V2.md`: signed references (`REF-*` entries with a source and a status; "a rule whose reference is unsigned does not fire"), restricted classes;
   - `PROMPT-RESUS-DESK-V2.md`: decision D4 and `recordEmergencyAdministration` (how a witness is recorded and authenticated);
   - `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md`: the problem card, the lane registry, the page header and the Emergency affordance;
   - the Encounter Plan guide for clerking step 10 (https://claude.ai/artifact/X8toWLjPX8G5jgHn8jcWoD): the prescribing dialog, its checks and their levels (Stop, Check, Note).
6. **Code:** `app/pharmacy/**`, `lib/pharmacy/**`, `lib/prescribing/**` (the dialog, the checks, `pharmacy.ts`), the prescription tables and their RLS, the doctor workspace's problem card, `/nurse/mar`, `/patient/track/medications`, the notification, SMS and realtime modules, the four-eyes module, the signed-reference module, the witness mechanism behind `emergency_administrations`, the hub's department and unit tables, the lab's downtime module if merged, the feature-flag module, `docs/NUMBERS.md`, `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface here reads or writes an engine with real tables, real RLS policies and passing tests, built in an earlier step than the surface.
2. **The pharmacy never changes a prescription.** A dose, route, frequency, duration or medicine is changed only by a prescriber, through the existing prescribing actions. The pharmacy's records sit beside the prescription: a review, a query, an outcome, a supply. A test enumerates every pharmacy action and proves none writes to a prescription row.
3. **One action, two records.** A supply and its stock movement commit in the same transaction, or neither does. Every supplied line names a product, a batch and an expiry. There is no supply without a batch and no "supplied" movement without a supply.
4. **Nothing leaves silently.** Every line of a prescription in scope ends in a recorded outcome. A line that is owed or being bought outside stays listed, and a queried line stays in the queue, until a person or the prescriber acts on it. Nothing closes, expires or is filtered out by itself.
5. **The record is append-only.** Supplies, stock movements, outcomes, queries, hand-overs and controlled-drug entries are events that are never updated or deleted. A balance is a projection over the ledger. A correction is a new event that names the one it corrects.
6. **The right patient.** A live hand-over is recorded only after two identifiers have been confirmed with the person at the window, or the supplier has recorded how the person was identified (D-PH1-16). The server refuses it otherwise. A supply entered after downtime records what the sheet shows, and goes to a pharmacist's look-back where the sheet shows no check.
7. **As written.** Directions are displayed and printed exactly as stored, character for character. The system never reformats, converts, rounds, completes or computes a dose, and never converts between strengths or units.
8. **No remembered numbers.** No dose, limit, class, high-risk medicine, reorder level or price in code, seeds or copy. Lists that drive behaviour (lane reasons, the high-risk list, controlled classes, outcome reasons, query codes, label wording) are signed, versioned, sourced data. Unsigned content never acts. What happens while each list is unsigned is stated in Appendix D: the stricter path where there is one, otherwise the rule does not fire and the screen says so. Test fixtures use invented medicines, batches and quantities, named as fixtures.
9. **The paper still rules for controlled drugs.** MedSync records a controlled supply with its witness and prints entries. It never says or implies that its record replaces the signed prescription or the statutory books.
10. **Informs, never blocks care.** Nothing in this slice prevents a clinician prescribing, or a nurse giving the first inpatient dose. The stock answer informs. The only hard stops on a live action protect the patient or the record, and this list is complete: no supply while a prescription awaits co-signature; no supply of a pharmacist-first line without a pharmacist's acceptance, or D-PH1-05's recorded reason where GATE A allows it; no hand-over without identity confirmed under Law 6; no supply without an unexpired batch that holds the quantity; no supply of a line twice, or of a version the prescriber has changed; no controlled supply without its count, its paper checks and its witness; and, only where the hospital has chosen it, no hand-over with payment status unrecorded (Emergency always passes). Entry after downtime refuses none of these: the medicine has already gone, so it records and flags (DT-10).
11. **Fail loud, not silent.** If a query cannot be delivered, a label cannot be printed or a message is not sent, the pharmacy sees it in words at once and is told what to do. The supply still records. A notification failure never rolls back or throws.
12. **No patient details off the platform.** SMS and any push text never name a medicine, a condition, a clinic or a prescriber. Prove it with the banned-term scan. Restricted classes stay restricted.
13. **True times.** Elapsed times use the server clock. A supply entered after downtime keeps the time written on the sheet, and says it was entered afterwards.
14. **Red is a safety property.** This slice adds **no red**. Out of stock, expired, not delivered, waiting for look-back and a count that does not match are **amber**, each with an icon and a word. "In stock" is neutral text; nothing is green. Stages are neutral chips, except Awaiting co-sign, which is a caution. The Emergency affordance on doctor and patient surfaces is untouched. Extend the red-scarcity tests to every new route and component.
15. **Behind flags, stack as found.** Four per-hospital flags, off by default: `pharmacyDispensing`, `pharmacyStockAnswer`, `pharmacyPatientList`, `pharmacyDowntime`. Dispensing also goes live **per dispensing point** (5.13). With all four off, behaviour matches the Phase 0 baseline. Use the ORM, package manager, flag mechanism and design tokens on the branch. TypeScript strict, no `any`. Zod on every action. AAL2. No new dependencies without stopping to flag. Tokens only, no hex. Print with CSS only. A clean clone must still run with Node 22 + pnpm. en-GB throughout. A pharmacy technician is never called a pharmacist. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it.

---

## 3. What earlier reads claimed, and what Phase 0 should have left (verify every line at Step 0)

Lines marked **(June)** were read from a clone at `4fbab0c`, 3 June 2026, four months behind `main`. Lines marked **(P0)** are what the Phase 0 prompt asked for; whether GATE A changed them is unknown here. The rest come from the Role Map, the Workspace Coverage review and the Encounter Plan guide, dated 10 Oct 2026.

| #   | Claim                                                                                                                                                                                                                   | Where                                    | Severity                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| R1  | **(P0)** Six pharmacy permission names exist. Only `pharmacy.view` is granted, to the Pharmacist and Pharmacy technician cadres, inside the approval transaction                                                        | access engine                            | **Dependency**                |
| R2  | **(P0)** `computeQueue` projects one row per placed prescription, with a window lane and a ward lane, and never drops a row                                                                                             | `lib/pharmacy/queue.ts`                  | Dependency                    |
| R3  | **(P0)** What groups the lines of one prescription was decided at Phase 0's GATE A (D-PH0-08). In June nothing did                                                                                                      | prescriptions                            | **Shape of everything here**  |
| R4  | **(P0)** The read model returns a signed field list and nothing else from the chart. Each open is logged                                                                                                                | `lib/pharmacy/prescription-view.ts`      | Dependency, privacy           |
| R5  | **(P0)** `pharmacyChecksState(hospital)` returns `dispensingRecorded: false` and `interactionsChecked: false`, and drives a notice that cannot be dismissed                                                             | `lib/pharmacy/check-state.ts`            | Dependency                    |
| R6  | **(P0)** Dispensing points are units of the Pharmacy department with a `serves` value, if the services hub was on the branch. Otherwise there are none                                                                  | hub, `lib/pharmacy/dispensing-points.ts` | **Stock needs a place**       |
| R7  | **(June)** A prescription row holds `dose` as text, `route`, `indication`, `controlled` and a state. It held no frequency, duration or quantity. The guide now lists dose, route and frequency; duration is unconfirmed | migration 0039, Encounter Plan guide     | **Quantity and refill date**  |
| R8  | The prescribing dialog runs eleven checks at three levels (Stop, Check, Note) and stores each answer and override reason. Interactions are not checked                                                                  | Encounter Plan guide                     | Lanes                         |
| R9  | `PharmacyAvailability` always returns `not_linked`, and the dialog shows "Pharmacy not linked yet"                                                                                                                      | `lib/prescribing/pharmacy.ts`, ADR 0190  | **The stock answer**          |
| R10 | What the prescribing list is keyed to was never read. Only three emergency entries carry a signed dose                                                                                                                  | formulary                                | **One medicine list**         |
| R11 | **(June)** `emergency_administrations` records a witness for controlled drugs under a database check. How the witness proves who they are was not read                                                                  | migration 0039, resus D4                 | Controlled drugs              |
| R12 | The nurse charts doses at `/nurse/mar`. The patient tracks medicines at `/patient/track/medications`. What each reads from was not read                                                                                 | Role Map                                 | Ward chip, patient list       |
| R13 | Gate CG is open: no clinical read or write ships in the mobile (Expo) app until the CSO signs a governance document                                                                                                     | project record                           | **Patient surfaces**          |
| R14 | Lab Phase 1 specifies a PHI-free realtime channel with a polling fallback, a downtime engine (form numbers, periods, drills), and readiness with a second approver. Whether any of it has merged is unknown             | `PROMPT-LAB-PHASE-1.md`                  | Reuse                         |
| R15 | The NCD build specifies an SMS provider interface, templates approved by two people, and a banned-term scan. Whether they are on this branch is unknown                                                                 | `PROMPT-NCDSYNC-BUILD-v2.md`             | Messages                      |
| R16 | No price and no payment status exist anywhere in MedSync                                                                                                                                                                | Workspace Coverage review                | Payment status                |
| R17 | The doctor prints prescriptions, so a signed paper prescription reaches the window with the patient                                                                                                                     | doctor workspace                         | Buy outside, controlled drugs |
| R18 | No general notifications engine exists                                                                                                                                                                                  | roadmap                                  | Queries                       |

---

## 4. Design direction

**Eight rules**

1. **The check comes before the count.** The reviewer sees what the prescriber was warned about, and what they answered, before any quantity field.
2. **One screen per prescription, one decision per line.** Supply in full, supply part, not on the shelf, or ask the prescriber. Nothing else.
3. **The shelf is on the line.** What this dispensing point holds, the batch that expires first and when the shelf was last counted sit beside the decision, never on another page.
4. **A "no" always has a next step.** Owed, bought outside or back to the prescriber, each with a reason and each told to the people who need to know.
5. **Ask them, do not tell them.** At hand-over the person says who they are; the screen never offers the answers to read out.
6. **Type the quantity, nothing else.** Batch, expiry, patient, medicine and directions come from the record.
7. **Say what the system is not doing** (carried from Phase 0). No interaction check. Few signed doses. No count since the delivery. Each is a sentence on screen.
8. **Paper is a first-class path.** The downtime sheet mirrors the screen, and the statutory books keep their place.

**Budgets** (measured at Step 0 where a baseline exists; met by Step 9)

- From opening a standard prescription of three lines, all on the shelf, to a recorded hand-over: **≤ 8 interactions**, the typed second identifier counting as one, where the prescription carries quantities. Where it does not, one typed quantity per line more.
- Fields typed by hand for batch or expiry at supply: **0**.
- `recordHandover` on the server: **p95 < 500 ms**.
- A query sent → visible on the prescriber's open workspace: **≤ 5 s** p95 with realtime, **≤ 15 s** with polling.
- Supplied lines without a batch: **0**. Supplies without a stock movement, and "supplied" movements without a supply: **0**.
- Lines that left the queue without an outcome: **0**. Lines supplied twice: **0**.
- Difference between any projected balance and the sum of its ledger: **0**.
- Back-entering one row of a downtime sheet: **≤ 30 s** in the timed trial.
- Prescription rows written by a pharmacy action: **0**.

---

## 5. Interface specification

### 5.1 Navigation, flags and what changes from Phase 0

- **Pharmacy navigation after this slice:** Queue · Open lines · Supplied today · Stock · Controlled drugs · Downtime entry · Emergency doses. Each item is registered through the Phase 0 registry and appears only when its flag is on, its page has been built and the viewer holds the permission.
- **The acting dispensing point.** The top bar shows the viewer's cadre and the dispensing point they are working at. A viewer assigned to several points chooses one; the choice is stored on every event they write. Stock, the queue's default filter and the controlled-drug record all follow it.
- **A point that is not live** (5.13) keeps the Phase 0 read-only queue and prescription view. With `pharmacyDispensing` on it also gets the Stock page, for set-up and the opening count, and nothing that supplies. A live point gets everything in this section. A point that was live and has been switched off keeps its Open lines page, so that what it left open can still be closed (RD-3).
- **Phase 0's lanes become a filter.** "For the window" and "On the wards" told a viewer where a prescription came from. From this slice the dispensing-point selector does that job (a prescription belongs by default to the points whose `serves` matches where it was written), and the two tabs on the queue become the review lanes in 5.2. "All dispensing points" is always one tap away, and any live point may open and supply any prescription of the hospital.
- **The period filter goes.** The queue shows every prescription in scope with a line that has no outcome, whenever it was written.
- **What is in scope** (LO-6): window prescriptions written since the hospital's first point went live. An earlier prescription is still found through Find a prescription and opens in the Phase 0 view, with one action: **Bring into the queue**.
- **The notice** reads from `pharmacyChecksState`. At a live point the sentence about dispensing is no longer true and is dropped; the rest stays (Appendix B).

### 5.2 The queue (artboard 1.1)

```
┌─────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TEST HOSP-1     │ Pharmacy / Queue                                                   Pharmacist · Outpatient pharmacy   │
│ ⌕ Find a        ├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│   prescription  │ Queue                                                                      Updated 10:42  [Refresh]   │
│ PHARMACY        │ [Pharmacist first 4][Standard 10][All 14]      [Outpatient pharmacy ▾]                                │
│ ▣ Queue       14│ [All stages][To review 2][Queried 1][Ready to hand over 0][Awaiting co-sign 1]                        │
│ ◷ Open lines   5├──────────────────────┬────────────────────────┬───────────────────┬───────────────┬────────┬──────────┤
│ ✓ Supplied    86│ Patient              │ Medicines              │ Why a pharmacist  │ Stage         │ Waiting│ Payment  │
│   today         │                      │                        │ first             │               │        │          │
│ ▤ Stock         ├──────────────────────┼────────────────────────┼───────────────────┼───────────────┼────────┼──────────┤
│ ⚿ Controlled    │ Patient Nine-9       │ Metformin, Amlodipine, │ ▲ Stop overridden │ To review     │ 50 min │ Paid     │ [Review]
│   drugs         │ MS-2026-00009        │ Amoxicillin            │                   │               │        │          │
│ ⇣ Downtime      │ Diabetes clinic · MO │ 3 lines · 1 not on     │                   │               │        │          │
│   entry         │                      │ the shelf              │                   │               │        │          │
│ ∿ Emergency     │ Patient Four-4       │ Amoxicillin            │ Child check       │ ▲ Awaiting    │ 37 min │ Not      │ [Open] Cannot be
│   doses         │ MS-2026-00021        │ 1 line · on the shelf  │                   │   co-sign     │        │ recorded │        supplied yet
│                 ├──────────────────────┴────────────────────────┴───────────────────┴───────────────┴────────┴──────────┤
│                 │ 4 of 14 at Outpatient pharmacy, pharmacist first. Waiting starts when the prescription was            │
│                 │ written. A prescription leaves the queue only with a recorded outcome for every line.                 │
└─────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Every name and figure in the wireframe is an example.

- **Lane tabs:** Pharmacist first · Standard · All, each with its count. Counts ignore the lane filter and always add up to "All".
- **Stage filter:** All stages · To review · Queried · Ready to hand over · Awaiting co-sign. Counts are within the current lane and dispensing point.
- **Dispensing-point selector:** this point by default, then each other point, then All dispensing points.
- **Columns:** Patient (two identifiers; under them the ward or clinic and the prescriber's cadre) · Medicines (names as stored; under them "n lines" and a stock summary) · Why a pharmacist first · Stage · Waiting · Payment · one control.
- **Stock summary:** "all on the shelf", "1 not on the shelf", or "stock not counted" (6.4). It informs the order of work; it never changes the lane.
- **Why a pharmacist first:** up to two reason chips from the signed lane reasons (6.5), most serious first, then "+n". An overridden stop is amber with an icon; the others are neutral. In the Standard lane the cell is empty.
- **Stage cell:** `To review` · `Queried · 12 min` · `Ready to hand over` · `Awaiting co-sign` (amber, clock icon). A prescription whose lines are at different stages shows the least advanced (LO-1), and the review screen shows each line's own.
- **Changed since printing** (carried from Phase 0, PQ-7): an amber chip beside the stage when any line changed after the last print. The paper the patient carries is then out of date.
- **The control:** `Review` for a viewer who may review this lane; `Open` otherwise. A prescription awaiting co-signature has `Open` and, beside it, the words _"Cannot be supplied yet"_: it can be read and queried, and has no supply decision.
- **Waiting** counts from when the prescription was written, on the server clock. No colour, no threshold: this slice signs no waiting-time target.
- **Payment:** the status recorded so far, in words (5.6), or "Not recorded". It never disables a control on this page.
- **Order:** within Pharmacist first, prescriptions with an overridden stop first, then oldest first. Within Standard, oldest first. The viewer may re-sort; the default returns on reload.
- **Earlier and still open.** Prescriptions written before today sit under a divider, _"Written before today, still without an outcome"_, with their age in days. They never drop off. **Close as not collected** is offered on each (5.7).
- **Refresh:** live through the same channel as queries if Step 0 finds one (6.7), otherwise the Phase 0 Refresh button and a 30-second tick for the clocks.
- **The lane explainer** sits under the table, always: how the lanes work, in the signed wording, naming the reasons that are switched on at this hospital. If no lane rule is signed, there is one lane and the explainer says: _"This hospital has not signed its review rule, so every prescription needs a pharmacist."_
- **Footer:** _"{n} of {N} at {point}, {lane}. Waiting starts when the prescription was written. A prescription leaves the queue only with a recorded outcome for every line."_

### 5.3 Review and supply (artboard 1.2)

One screen per prescription. Left: the lines. Right: the checks that came with it, then the query form.

- **Head:** two identifiers, sex and age; the facts Phase 0's read list allows, each with its date (weight, latest creatinine, allergies); the payment status, with **Set** (5.6); the lane and its reasons as chips; **Changed since printing**, if so.
- **The notice** (Appendix B), wired to `pharmacyChecksState` and to this prescription: how many of its doses have a signed reference.
- **Each line shows:**
  - the medicine, form and strength as prescribed, and the problem it is for;
  - the directions **as written** (Law 7);
  - any overridden stop, in a block: the check, what triggered it, and the reason the prescriber gave, verbatim;
  - what the prescriber was told about stock, if the stock line was on (5.10);
  - **Already supplied on an earlier version:** the quantity and date, when the prescriber changed a line after part of it was supplied (RQ-9);
  - **On the shelf here:** the quantity at this dispensing point in issue units and when it was last counted; or _"0 · out since {date}"_; or _"Not counted yet"_;
  - **Elsewhere in the hospital**, only when this point has none: each other live point that holds it;
  - **Batch, first to expire:** batch number and expiry, with **Change** (5.3.1).
- **One decision per line** (radio):
  - **Supply in full**, with the quantity. It is pre-filled only when the prescription carries a quantity (SU-6); otherwise it is empty and required. This choice is pre-selected when the medicine is on the shelf here and the quantity is known; nothing is recorded until the hand-over;
  - **Supply part**, with the quantity supplied now, the quantity not supplied, and what happens to the rest: _owed_ · _the patient buys it outside_;
  - **Not on the shelf**, which opens 5.5;
  - **Ask the prescriber**, which opens the query form on this line (5.4).
- **In a pharmacist-first prescription every line needs a pharmacist's acceptance** before its supply decision can be saved (LN-2). A line with a lane reason needs its own tap: **Accept this line**, or, where a stop was overridden, **Reason accepted, supply**, beside **Ask the prescriber**. **Accept the remaining lines** takes the lines with no reason in one tap. A viewer without `pharmacy.review` sees the lines read-only with _"Waiting for a pharmacist"_.
- **Supply without a pharmacist** is offered to a holder of `pharmacy.dispense` only where D-PH1-05's setting is on, and never for a controlled line. It takes a reason from the signed list, and the supply goes on the look-back list (5.7). Where the branch has a presence signal (Q21), the control is not offered while a holder of `pharmacy.review` is present at any point of the hospital.
- **A pharmacist may decline to supply** a line that has been queried (5.4), with a coded reason and a note. The prescriber is told, and the patient's list says so in the signed wording. There is no silent hold.
- **Days this supply covers** (optional, a whole number typed by the dispenser): used only for the patient's refill date (ML-3). The system never works it out from the directions.
- **Substitution note** under the lines, in signed wording (Appendix B). The product picker offers only products of the prescribed medicine (5.3.1).
- **Footer:** _"{n} of {N} lines have an outcome. Each supply takes its quantity from the batch shown, in the same step."_ Buttons: **Save and keep in the queue** · **Continue to hand-over** (enabled when at least one line is to be supplied and every other line has a decision, an outcome or an open query).
- **A line changed by the prescriber while this screen is open** is marked _"Changed by the prescriber at {time}. Review it again."_ Its old version is struck through. Any acceptance or supply decision on the old version no longer counts, in either lane (RQ-9, SU-2).

#### 5.3.1 Choosing the product and the batch

- **Product:** the products set up at this point for the prescribed medicine (same generic name, form and strength). One product is pre-selected when only one has stock.
- **A different pack** of the same strength needs no reason.
- **A different strength** is offered only when the signed substitution rule allows it. It needs `pharmacy.review`, a coded reason, and **the pharmacist's line**: how to take this strength, typed by the pharmacist (80 characters). The screen shows the prescribed directions and the pharmacist's line side by side and asks for one confirmation. The pharmacist's line is stored on the supply and printed on the label and the patient's list under the prescribed directions, marked _"From the pharmacist"_. The prescriber is informed; no answer is needed. The system computes nothing.
- **Batch:** the unexpired batch that expires first is pre-selected. If it holds less than the quantity, the screen proposes a split across batches in expiry order, one row each. Choosing any other batch needs a coded reason.
- **An expired batch** is never offered. It is listed beneath as _"Expired {date}. Remove it from the shelf."_ in amber, with an icon.
- **The shelf has it and MedSync says none:** **Add a batch found on the shelf** (batch number, expiry, quantity counted, reason). It needs `pharmacy.stock`. If the medicine has no product at this point, the same holder adds one first; it is marked _"Added at the window"_ for the pharmacy in charge to check.

### 5.4 Ask the prescriber, and the prescriber's answer (artboards 1.2 and 1.10)

**In the pharmacy.** Any holder of `pharmacy.dispense` or `pharmacy.review` may send a query.

- **About:** one line, or the whole prescription. A query about the whole prescription puts every line that has not been supplied at `Queried`.
- **Type of problem:** from the signed query codes (Appendix D). "Not available, alternative needed" is the type used when a line is returned to the prescriber from 5.5.
- **What you propose:** text, 500 characters. Shown verbatim to the prescriber as "From the pharmacy".
- **The patient is waiting at the window** (checkbox). The prescriber sees it.
- **Send query.** The line's stage becomes `Queried`. Lines that are not part of the query can still be supplied.
- **Withdraw** a query that is no longer needed, with a reason. The line returns to "To review", and the prescriber's card shows the query as withdrawn. A query never traps a line: if the prescriber cannot be reached, the pharmacy withdraws it and records what it does instead.
- **Who receives it:** the prescriber, and the patient's current responsible clinician if different (RQ-3). The form names them by cadre and place before sending. If nobody can be resolved: _"Nobody can be told in MedSync. Call the ward or clinic."_ in amber.
- **After sending:** the line shows _"Query sent {time} · not answered"_. This never reads as "the prescriber knows". If delivery failed: _"The prescriber has NOT been told. Call them and log the call."_
- **Log a phone answer:** who you spoke to (a staff search limited to this hospital), what they said (keep as written, with their reason · will change it · stop it), and the time. A phone "keep" from a clinician who may prescribe answers the query, naming that clinician; they see _"The pharmacy recorded your phone answer at {time}"_ and can dispute it, which reopens the query. A phone "will change it" or "stop it" answers nothing: the line waits until the prescriber changes or cancels it in MedSync.

**On the doctor's problem card (artboard 1.10).**

- A chip on the line: _"Pharmacy query · waiting {n} min"_, and a count in the step header (_"2 from the pharmacy"_).
- **The query:** who sent it (by cadre), when, the type, the proposal verbatim, and whether the patient is waiting at the window.
- **Your answer**, one of three:
  - **Keep it as written**, with a coded reason. It goes back to the pharmacy and into the note;
  - **Change the prescription.** For a query about one line this opens the existing prescribing dialog on that line; the pharmacy then sees the new line and the old one struck through, and the query closes. For a query about the whole prescription it opens the plan step; the prescriber changes what they choose and then confirms **Changes made**, which closes the query;
  - **Stop this medicine** (or, for the whole prescription, **Stop the remaining medicines**), which cancels through the existing action, with the reason.
- **Call the pharmacy** shows the dispensing point's number from the hub as text. If none is set, the button is absent.
- **Any clinician who may prescribe for this patient at this hospital may answer.** The first answer wins; any later attempt is shown the first.
- **A line that was not supplied** shows on its problem card: _"From the pharmacy, {time}. {Medicine} was not supplied: {reason}. {What the patient was told}."_ Buttons: **Choose an alternative** (opens the prescribing dialog) · **Leave it as it is**. No answer is required for an owed, bought-outside or declined line.
- Queries and not-supplied notices for a patient also show to whoever opens that patient's plan, at the patient's next visit, until the line is closed.

### 5.5 Not on the shelf (artboard 1.3) and the slip to fill elsewhere (artboard 1.8)

- **Head:** the medicine; _"Out since {date} · {n} days"_ when a stock-out is on record; this point's count and when; each other live point that holds it; other strengths here, for the pharmacist's information only.
- **What happens to this line** (one choice):
  - **Owed to the patient.** The line goes to Open lines. The patient comes back when stock arrives. Nothing is held for them;
  - **The patient buys it outside.** Prints the slip. The line goes to Open lines until it is confirmed filled or closed;
  - **Send for it from another point.** Shown only when another live point holds it. The line is owed; the other point's Stock page shows the request (SL-7);
  - **Return to the prescriber** for an alternative. This sends a query of the type "not available, alternative needed" (5.4). The line is `Queried` and stays in the queue.
- **Quantity not supplied** (a whole number, optional): pre-filled only from a structured quantity on the prescription. Where it is empty, the slip prints _"Quantity: as on the prescription"_.
- **Reason recorded:** from the signed outcome reasons (Appendix D).
- **A controlled drug** is never offered "buys it outside". The choice is absent, and the screen says why.
- **Who is told** (shown before recording, each in its own words):
  - the prescriber, on the problem card;
  - the patient: _"Tell the patient now."_ Then, if `pharmacyPatientList` is on, what their list will say; and if live SMS is on, that a message goes. If neither is on, the screen says: _"No message is sent. The patient knows only what you tell them."_;
  - the pharmacy in charge: _"This stock-out has turned away {n} prescriptions since {date}."_
- **Buttons:** Cancel · **Record** (or **Record and print**).

**The slip (A5, print CSS only, black on white).**

- Hospital and dispensing point; the words _"Medicine not supplied: to fill at another pharmacy"_; the prescription number if one exists; the date.
- Patient: name, MedSync number, sex and age.
- Each medicine by **generic name**, form and strength; the directions **as written**; the quantity not supplied.
- Prescriber: name, cadre and council number, from the record (D-PH1-37 allows these three on the slip; pharmacy screens still show the cadre only).
- A box for the supplying pharmacy: name and stamp, quantity supplied, date.
- A verification line: _"To check this is real, call the hospital pharmacy on {phone} and give this code: {code}."_ Typing the code into Find a prescription opens the slip's record for pharmacy staff of this hospital (LB-6).
- **It is not a prescription by itself.** It carries the line GATE A signs (D-PH1-13): by default, _"Give this to the pharmacy together with your signed prescription."_ The canvas shows a signature box; build the wording GATE A signs, not the box.
- If the prescription changed since it was last printed, the slip says so: _"The prescription was changed on {date}. Ask the hospital for a new copy."_
- Footer: _"Controlled drugs are never printed on this form. Printed {time} at {point}. Copy {n} of {N}."_ Every print is logged.

### 5.6 Hand-over (artboard 1.4): identity, labels, what was explained, payment

Four numbered sections and a summary. The supplier may be a different person from the reviewer; the head says _"Reviewed by {cadre} · {time}"_ when a pharmacist accepted lines, _"Standard lane: checked at supply"_ when not, and _"Supplied without a pharmacist: {reason}"_ under D-PH1-05.

1. **Confirm who is at the window.**
   - **Collected by:** The patient · Someone else (their name and their relationship to the patient).
   - **First:** _"They said the patient's full name, and it matches."_ (checkbox, attested by the supplier)
   - **Second:** the patient's **date of birth** or **phone number on file**, as the person says it. The supplier types it; the server compares it (SU-4). Neither value is shown on any pharmacy screen, so it cannot be read out. The MedSync number is on screen and on the paper, so it does not count as the second identifier.
   - Wording under the section, signed: _"Two identifiers are needed before the hand-over can be recorded. Ask the person to say them; do not read them out."_
   - A wrong value: _"This does not match. Check you have the right patient."_ After five wrong tries on one hand-over the typed check closes for that hand-over and only the route below remains.
   - **Identified another way** (any holder of `pharmacy.dispense`): for a person who cannot give either, or a record that holds neither. The supplier chooses how (_the card or prescription with the patient's number was shown_ · _known to staff_ · _other, with a note_). It stands in for the second identifier, is stored with the supplier's name, is listed for the pharmacy in charge and is counted in the final report. Nobody is turned away for lacking a document.
2. **Supplying now.** A table of the lines: medicine · quantity · batch and expiry · outcome. Then the labels.
   - **Label mode** is a setting of the dispensing point (D-PH1-17): **Printed** (print CSS only) or **Written by hand on the envelope** (one checkbox: _"I have written the label on each envelope"_).
   - **One label per batch supplied.** A line split across two batches prints two labels, each with its own quantity, batch and expiry.
   - **A printed label carries** the fields GATE A signs (LB-1). Proposed: the patient's name; the medicine by generic name, form and strength as supplied; the directions as written; the pharmacist's line, if there is one, marked _"From the pharmacist"_; the quantity; the batch and expiry; the date; the dispensing point, the hospital and its address; and the signed warning lines.
   - **Additional instructions:** zero or more lines chosen from the signed list. Nothing is typed onto a label at hand-over. The pharmacist's line on a strength change (5.3.1) is the only typed text a label ever carries.
   - **Print labels** shows a preview. If printing fails or is cancelled, the supplier can switch this hand-over to "written by hand"; that is recorded.
3. **Explained.** Checkboxes from the signed counselling points, and the language it was explained in. Neither is required to record; what was ticked is what is recorded.
4. **Payment status**, if the hospital uses it (D-PH1-20): Paid (with an optional receipt reference) · Exempt (coded reason) · Insured (scheme, text) · Emergency · Not recorded. It can be set earlier from the review screen's head, which is why the queue can show it. Where the hospital requires a status, "Not recorded" cannot be handed over; **Emergency** always can, with nothing further asked. MedSync checks no payment.

- **When you record it:** a plain list of what will happen, with real numbers: how many items leave which batches; which lines stay under Open lines; and, where `pharmacyPatientList` is on, which medicines appear on the patient's list and which get a refill date.
- **Buttons:** Back · **Record hand-over**. The server re-checks every line and every batch under a lock (SU-2). What it can answer:
  - _"Batch {no} now holds {n}. Choose again."_
  - _"{Medicine} was already supplied at {point}, {time}."_
  - _"{Medicine} was changed by the prescriber. Review it again."_
    In each case nothing is written.
- **After recording:** the prescription leaves the queue if every line has an outcome, and the screen shows the outcome of each line, never a bare success message.

### 5.7 Open lines (artboard 1.7), Supplied today and the look-back list

**Open lines.** Medicines that were prescribed and not yet supplied in full.

- **Tabs:** All · Owed · Buying outside, each with its count. Lines that are with the prescriber are queries and stay in the queue under "Queried".
- **Columns:** Patient · Medicine (with what was already supplied, or when the slip was printed) · Outcome · Reason · Open since (date and age) · action.
- **Actions by outcome:**
  - _Owed:_ **Supply now**, shown when the medicine is on the shelf at this point; it opens hand-over for that line. **Tell the patient it is here** sends the "in stock" message (5.11) and records who sent it; it appears only when the medicine is on the shelf and a message can be sent. **Change to buying outside** prints the slip. **Close** (with a coded reason);
  - _Buying outside:_ **Confirm filled** (the patient or the other pharmacy says it was supplied; who said so is recorded) · **Supply now**, when the medicine is on the shelf at this point · **Change to owed** · **Close** (with a coded reason).
- A line the patient marked in the app shows it: _"The patient says they bought it"_ (already closed, ML-4) or _"The patient could not get it"_ (amber, with an icon, still open).
- Explainer under the table, signed. Nothing leaves this list without a person's action.

**Close as not collected** (from the queue's "written before today" group): one prescription, a coded reason, an optional note. The prescriber sees it at the patient's next visit.

**Supplied today.** Every hand-over at this point today, newest first: time · patient · lines and quantities · batches · supplied by · reviewed by. Actions: **Reprint labels** (logged) · **Reverse** (5.7.1). A filter, **Identified another way**, lists those hand-overs for the pharmacy in charge. Once Step 8 is built, a link prints the day's dispensing log (5.12).

**Look-back** (a tab on Supplied today). Supplies that were recorded without a check a live supply needs, each with why, oldest first:

- a pharmacist-first supply made without a pharmacist, under D-PH1-05;
- a supply entered after downtime that a live hand-over would have refused, for any of the reasons in DT-10;
- a supply made on a phone answer the clinician later disputed (RQ-7).
  A holder of `pharmacy.review` opens each and records **Looked at**, with a note, or sends a query. While anything waits, the tab reads _"Look-back · {n} waiting"_ with a caution icon.

#### 5.7.1 Reversing a supply, and correcting the record

**Reverse**, for a supply handed back at the window before the patient left, or recorded in error and caught the same day.

- Who: a holder of `pharmacy.manage` or `pharmacy.review`. For a controlled drug they must also hold `pharmacy.controlled`, and a witness is needed.
- A coded reason (Appendix D), and whether the pack is back and fit to return to the shelf.
- **Fit:** the quantity returns to its batch. **Not fit:** it returns to its batch and is written off in the same step, with the reason, so the shelf figure is right and the loss is on record.
- The supply stays in the record, marked _"Reversed {time} by {cadre}: {reason}"_. The line returns to the stage or open outcome it had immediately before that hand-over. The prescriber sees the reversal on the problem card.
- Reversal is offered on the hospital-local day the supply was recorded (for a back-entered supply, the day it was entered).

**Correct the record**, for an error found later (for example, a supply recorded against the wrong patient). A holder of `pharmacy.manage` marks the supply _"Recorded in error"_ with a reason and a note. It moves no stock: the shelf is put right by a count. It withdraws the entry from the patient's list, tells the prescriber, returns the line to where it stood before that hand-over, and stays in the record for audit.

### 5.8 Stock at the dispensing point (artboard 1.6)

For holders of `pharmacy.stock`; read-only for other pharmacy staff.

- **Three figures:** medicines out of stock now (and how many are vital, where the list carries that class) · batches expiring within the hospital's own look-ahead (an operational setting) · medicines counted this week.
- **Filter tabs:** All · Out · Low · Expiring · Not counted this week.
- **Table:** Medicine (with its class from the national list, if imported) · On the shelf · First batch to expire · Counted · State · Supplied in the last 7 days.
- **State, in words:** `In stock` (neutral) · `Low` · `Out · {n} days` · `Expiring · {n} days` · `Expired, remove` · `Count needed` (when any batch's projection is below zero). All but the first are amber with an icon.
- **"Low"** means under the reorder level this pharmacy set for the medicine at this point. A medicine with no level is never shown as low. The page says so.
- **Detail panel** for one medicine: its products and batches (batch · expires · on the shelf), today's movements (time · what · quantity · batch · source · who), then **Set reorder level** · **Adjust** · **Correct batch details**.
- **Receive stock:** product · batch number · expiry · quantity · from (Main store · A supplier · Borrowed from another facility · Returned from a ward) · an optional delivery reference. **Add to stock.** A batch number already at this point with a different expiry is refused with both shown.
- **Count:** one medicine or a full count. The counter types what is on the shelf, batch by batch, **without being shown the expected figure**. On saving, a match records _"Counted {n} · matched the record"_; a difference shows both figures, asks for a reason and records the correction (SL-6).
- **Adjust:** a signed quantity and a coded reason (damaged · expired, removed · lost · found on the shelf · other, with text). No adjustment without a reason.
- **Correct batch details** (holders of `pharmacy.manage`): a mistyped batch number or expiry is corrected by a new event that keeps the old value in the record (SL-11).
- **Send to another point:** product, batch, quantity, destination. Both movements commit together (SL-7). Requests from other points (5.5) are listed at the top.
- **Products:** a holder of `pharmacy.stock` adds a product to a medicine (name, manufacturer, pack size, issue unit, registration number). Setting or changing a price needs `pharmacy.manage`. The issue unit locks once the product has a movement.
- **A controlled product** takes every action on this page through the witnessed path in 5.9. Until Step 7 is built, a product of a controlled medicine cannot be added or received, and the page says: _"Controlled drugs are set up in the next step."_
- **Opening count.** Before a point goes live, each product it stocks needs one count. The page shows how many remain (RD-1).

### 5.9 Controlled drugs (artboard 1.5)

**The supply screen** takes over 5.6 for any hand-over that includes a controlled line (CD-1). It is reached only once a pharmacist has accepted the prescription's lines. It records the whole hand-over, controlled and other lines together.

- **Head:** the patient; where they are; who prescribed and that it was witnessed at prescribing; the class chip from signed data, or _"Controlled drug"_ with no class when none is signed; **Changed since printing**, if so, in amber with an icon.
- **The notice,** amber, with an icon, not dismissible, signed: _"MedSync's record does not replace the paper. Keep the signed prescription and make the entry in the hospital's controlled drugs register, as you do today."_
- **The line:** medicine, form, strength; directions as written; quantity to supply; batch.
- **The witness comes first.** A second person chooses their own name from the staff allowed to witness (CD-2) and proves who they are with their own second factor, through the mechanism Step 0 finds. The witness can never be the supplier.
- **The count, batch by batch,** with the witness present. For each batch of this product in the cupboard: _In the cupboard before_ (typed by the supplier, not pre-filled). **Check the count** commits what was typed, and only then shows MedSync's figure (CD-3). Then _Supplying_ and _In the cupboard after_.
- **If the count differs from MedSync's balance:** both figures are shown in amber with _"The count does not match the record. Record the difference; it goes to the pharmacy in charge."_ The supply can continue from the counted figure.
- **Paper that still applies** (both required): _"The signed prescription is here, matches what is on this screen, and will be kept."_ · _"The entry is made in the controlled drugs register, and the person collecting has signed it."_ **Print the register entry** prints a slip to copy from or attach (LB-7); it is never called the register.
- **The witness's agreement:** _"I, the witness, saw the count and agree with the balance of {n}."_
- **Record supply** stays off until the witness, the count, both paper checks and the witness's agreement are complete. The identity check, labels, what was explained and payment status of 5.6 are sections of this screen too.

**The Controlled drugs page.** One medicine at a time at this point: every receipt, supply, count, transfer, reversal and difference, each with in, out, balance, by and witness. Actions: **Count now** (a witnessed count, used at shift hand-over) · **Receive** (witnessed) · **Print entries** for a date range. At the top: open differences, each closed by the pharmacy in charge with a note; and controlled supplies entered after downtime, each confirmed against the register by a holder of `pharmacy.controlled` with a witness (DT-8).

### 5.10 The prescriber's stock line (artboard 1.10), and the review state on the ward

**In the prescribing dialog's Check step,** behind `pharmacyStockAnswer`. The seam of ADR 0190 now answers for a hospital with a live point (6.4). One line per medicine, in words:

- _On the shelf at {point}. Counted {when}._ (Note) Where there has been a receipt and no count: _Received {when}, not yet counted._
- _Low at {point}. Counted {when}._ (Note)
- _Not on the shelf at {point}{ since {date}}. {In stock at {other point}.}_ (Check: **Aware; prescribe anyway** · **Pick something else**)
- _Not stocked at {point}._ (Check, the same two choices)
- _Stock at {point} has not been counted {since {date} | yet}. This answer may be wrong._ (Note)
- _Pharmacy not linked yet._ (as today, when no point serving this patient is live)
- **The prescriber never sees a quantity.** The level of each state is signed at GATE A (D-PH1-22). No state is ever a Stop. Placing always works.
- The answer the prescriber saw is stored with the prescription like any other check, so the pharmacy reads _"The prescriber was told it was not on the shelf"_.
- Suggested alternatives are not built. They need a signed drug-class map.

**On the nurse's administration record,** a read-only chip on each inpatient medicine: `Pharmacy: not yet reviewed` · `Pharmacy: reviewed {time}` · `Pharmacy: query with the prescriber` (amber, with an icon) · `Pharmacy: standard lane, not reviewed`. It changes nothing a nurse can do. The first dose is never held (roadmap D-PH-01).

**Inpatient prescriptions in this slice.** With individual inpatient supply off (the default, D-PH1-02): a pharmacist-first ward prescription is in the queue for review and can be queried; it has no supply decision and says _"Ward doses come from ward stock, which MedSync does not count yet."_; it leaves the queue when a pharmacist has accepted its lines. A standard-lane ward prescription is not in the queue. With the setting on, ward prescriptions follow the whole of this section, and the hand-over is to a named member of ward staff.

### 5.11 The patient's medicine list (artboard 1.11) and messages (artboard 1.12)

Behind `pharmacyPatientList`. **Web only.** These are the responsive pages at `/patient/track/medications`. If Step 0 finds the patient's list exists only in the Expo app, build the data contract and its tests, build no patient screen, and report it (Gate CG).

- **A group per hand-over:** _"From {hospital} pharmacy, {date}."_
- **A supplied medicine:** name, form and strength as supplied; the directions **as written**; the pharmacist's line, if there is one, marked _"From the pharmacist"_; _"{n} {units} given today"_ (one entry per line, however many batches); and _"Next supply due around {date}"_ only when ML-3 allows a date.
- **A medicine not supplied:** _"Not given today"_, why in the signed patient wording for that outcome, and what to do. For a line being bought outside: **I have bought it** · **I could not get it**.
- **Ask about my medicines** links to the existing contact route; if none exists, the button is absent.
- The Emergency affordance stays as it is.

**Messages.** Three kinds: _a medicine was not available and is owed_ · _a medicine was not available and is to be bought outside_ · _an owed medicine is in stock today_. The first two go when the outcome is recorded. The third goes only when a person presses **Tell the patient it is here** (5.7); it says the medicine is in stock today, and promises nothing more.

- Text from approved templates only (Appendix B), each `draft` → `approved` by two different users.
- **No medicine, condition, clinic, dispensing point or prescriber** in any message. The message names the hospital by its **message name**: a neutral name the hospital sets and the CSO signs, for hospitals whose own name would reveal a condition.
- **SMS** goes through the existing provider interface. Live sending is a hospital setting, **off by default**. With it off, the pharmacy's "Who is told" list says _"SMS is off at this hospital."_
- **Push** is specified (same text) and **not built**.
- A patient with no app and no number on file gets neither; the pharmacy's list says so.

### 5.12 Downtime (artboard 1.9) and the dispensing log

Behind `pharmacyDowntime`.

**The sheet.** A4, print CSS only, black on white, legible in greyscale. Its head: dispensing point, date, when downtime started. **Supplies**, in numbered rows: time · patient name and number · medicine, form, strength · quantity · batch · prescription · two identifiers checked (tick) · pharmacist's initials, for a prescription a pharmacist reviewed · supplied by. **Not supplied**, in numbered rows: time · patient · medicine · why · owed or to buy outside. **Entry into MedSync:** entered by, signature, date and time. **Print blank sheets** reserves a run of sheet numbers on the server and prints one on each sheet. The supply columns follow the hospital's Daily Dispensing Log; see DL-1.

**Downtime entry.** A navigation item with a count of sheets still to enter.

- **Record a downtime** (holders of `pharmacy.manage`): start, end, reason, and which sheet numbers were used. Those sheets become "to enter"; the rest of the run stays unused.
- **Enter a sheet** (holders of `pharmacy.dispense`): the sheet number; then row by row: the row number; the patient, found by MedSync number or name (a patient who is not registered cannot be created here: _"Register this patient at reception first"_); the prescription, if MedSync holds it, or **A paper prescription** (prescriber's name and cadre as written, the date, and each medicine with its directions typed as on the paper, marked _"Transcribed from a paper prescription"_); the product, batch and quantity; _Time supplied, from the sheet_; _Supplied by_; whether the identity tick is on the sheet; the pharmacist's initials, if any.
- **A "not supplied" row** is entered as that outcome, with the sheet's time and reason.
- **A controlled drug** on the sheet also takes the witness's name as written and the tick that the register entry was made.
- **A time outside every recorded downtime** is refused, with: _"Ask the pharmacy in charge to record this downtime first."_
- **Buttons:** Save row · Save and next row · **Sheet complete**. The footer shows _"Saved as: supplied 13:40, entered 14:52."_ A row can be entered once. A completed sheet takes no more rows.
- **Entry refuses nothing that has already left the pharmacy.** Where a live supply would have been refused, the row is recorded and goes on the look-back list with the reason (DT-10).
- **How it shows afterwards:** the supply carries a neutral tag, _Entered after downtime_, with _"Supplied 13:40 · entered 14:52 · sheet DS-00031"_, wherever the supply appears.
- **If back-entry takes a batch below zero,** it is still recorded, and the medicine shows _Count needed_ until someone counts it (DT-7).
- **Record a drill:** date, who took part, what was done, problems found. A drill writes no patient record and moves no stock.

**The Daily Dispensing Log.** From Supplied today: a printable log of the day's supplies at this point, one row per batch supplied, in the column order of the hospital's own HMIS 016 book (DL-1). Until the pharmacy in charge has confirmed the column map, the print carries a line at the top: _"Columns not yet confirmed against this hospital's dispensing log."_

### 5.13 Going live at a dispensing point

In the hospital admin's Departments and services area, under Pharmacy, on each dispensing point. Six conditions, each with its state, its evidence and its action (RD-1): the content is signed · the legal interim answers are on record · the stock is set up and counted · a downtime drill is recorded · the pharmacy and the prescribers are briefed · an in-charge is named for the point. **Switch on dispensing** opens only when all six are met, and needs a second approver through the existing four-eyes mechanism. The page carries no PHI. A second point at the same hospital needs its own six conditions and a recorded note on how the first point's pilot went (RD-5). **Switch off** needs a reason and a second approver (RD-3).

Until Step 8 builds this page, the test hospital's points are made live by a test fixture, never by hand in the database.

### 5.14 Phone, tablet and known differences from the canvas

- **Desktop-first for the pharmacy;** unbroken at 834 px (a tablet at the window) and 390 px. Touch targets at least 44 px. No mobile (Expo) work.
- **The doctor's answer** to a query works one-handed at 390 px: the three answers stack, and Send answer sits in a sticky footer.
- **Differences from the canvas, where this prompt wins:**
  - the canvas lists "typed dose with no signed reference" as a reason for the pharmacist-first lane. With three signed doses in the whole product, that would put nearly every prescription in that lane. Each reason is switched on per hospital at GATE A, with Step 0's counts in front of the CSO (D-PH1-04);
  - the slip to fill elsewhere (1.8) is titled "Prescription to fill elsewhere" and has a signature box. It is a not-supplied slip that goes with the signed prescription (5.5);
  - Open lines (1.7) has a "With the prescriber" tab. A line returned to the prescriber is a query and stays in the queue under "Queried";
  - "Ask the Inpatient pharmacy to send stock" (1.3) is a request shown on the other point's Stock page and a two-movement transfer, not a workflow with its own states;
  - the hand-over artboard (1.4) offers the MedSync number and a tick list for the second identifier. The second identifier is the date of birth or the phone number, typed and compared on the server (5.6);
  - the hand-over artboard always prints labels. Label mode is a setting of the point;
  - the controlled artboard (1.5) shows MedSync's balance beside the count. The count is typed and committed first (5.9);
  - the Stock artboard (1.6) shows the expected figure beside a count. The count is blind (5.8);
  - the messages artboard (1.12) names the dispensing point and says an owed medicine is "ready to collect". Messages name the hospital only, and say "in stock today";
  - the canvas shows no way to reverse a supply, to correct a record, to decline to supply, to close a prescription as not collected, to record days covered, or to look back at a supply. All are built;
  - the patient screens (1.11, 1.12) are drawn as a phone app. They are the responsive web pages; push is not built;
  - the answer reasons on 1.10 are examples; the list is signed;
  - every medicine, quantity, batch, price and phone number on the canvas is an example.

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Access (extend the workspace-neutral access engine)

- **PA2-1** Four of the reserved permissions (`pharmacy.review`, `pharmacy.dispense`, `pharmacy.stock`, `pharmacy.controlled`) are granted by the signed map, version 2 (Appendix A), inside the same audited approval transaction that grants `pharmacy.view`. A backfill with a dry run covers staff approved earlier.
- **PA2-2** `pharmacy.review` is granted only to cadres the signed map names. In the proposed map that is the Pharmacist cadre alone.
- **PA2-3** `pharmacy.manage` derives from a hub assignment (head of the Pharmacy department, or in-charge of a dispensing point) and lasts only while the assignment does. Granting and lapsing are audited.
- **PA2-4** Every pharmacy write checks the permission in Section 8's table, the hospital, and that the acting dispensing point belongs to that hospital. The acting point is stored on the event. Beyond that:
  - a review, a supply decision, an outcome and a hand-over need a point that is **live**;
  - stock set-up, receipts, counts, adjustments, transfers and products need `pharmacyDispensing` on at the hospital, live point or not;
  - sheets, back-entry and drills need `pharmacyDowntime` on, live point or not;
  - closing an open line, confirming it filled and correcting a record stay allowed at a point that was live and has been switched off.
- **PA2-5** A prescriber answers a query with the prescribing permission they already hold. Nurses and reception hold no pharmacy permission. The ward chip is read through a server function that returns the review state and nothing else.
- **PA2-6** Who may witness a controlled action is a signed list of permissions (proposed: any holder of `pharmacy.dispense` at the hospital). A witness is always a different user from the actor.
- **PA2-7** Revocation on deactivation, affiliation end or cadre change covers all six permissions, in the same transaction, audited. Events a person wrote keep their name and cadre as they were.

### 6.2 The catalogue: medicines and products (`lib/pharmacy/catalogue.ts`)

- **CT-1** A **medicine** is the row the prescribing list already holds: generic name, form, strength. There is one medicine list. If Step 0 finds the prescribing list cannot serve as it (no stable id, free-text entries), **STOP and report**; do not create a second list.
- **CT-2** A **product** belongs to one medicine: product name, manufacturer, pack size, issue unit, registration number (optional), price (optional), active. Products are per hospital. A product is **at a point** when it has an active product-at-point row there. The row is created when the product is first added, received or counted at that point, and is ended by the pharmacy in charge when the point stops stocking it.
- **CT-3** National-list fields (level of care; vital, essential or necessary class) attach to a medicine as imported, versioned reference data (roadmap D-PH-03), matched on generic name, form and strength. Unmatched rows are listed for a person to resolve. Nothing is matched by guess.
- **CT-4** A product's issue unit is fixed once any movement exists. A different unit is a new product. The system never converts between units, packs or strengths.
- **CT-5** A price is a decimal amount in Uganda shillings on the product. A supply stores the price in force as a snapshot. Nothing in this slice adds prices up.
- **CT-6** A supply needs a product. A medicine with no active product at a point shows _"No product is set up for this medicine at {point}."_, with the action to add one for a holder of `pharmacy.stock` (5.3.1).
- **CT-7** A medicine's controlled class and its place on the high-risk list are signed data keyed to the medicine, per hospital, versioned (6.9, 6.5).

### 6.3 The stock ledger (`lib/pharmacy/stock/**`)

- **SL-1** Stock is a ledger of movements, append-only, enforced by trigger. Kinds: `received`, `supplied`, `reversed`, `adjusted`, `count_correction`, `transfer_out`, `transfer_in`. A `counted` event records each count, with or without a correction.
- **SL-2** `balance(batch, point)` is the sum of that batch's movements at that point. No balance is stored as an editable figure. A cached projection is allowed only if a test rebuilds it from the ledger and finds them equal after every scenario.
- **SL-3** A batch is a product, a batch number and an expiry, at a point. The same batch at two points is two balances. A batch number already at a point with a different expiry is rejected.
- **SL-4** No live action takes a batch below zero. The check and the write happen under a row lock on the batch. Back-entry after downtime is the one exception (DT-7).
- **SL-5** A batch is **expired** when its expiry is before the hospital-local date (an expiry given as a month expires at the end of that month). An expired batch is never offered for supply and never counts towards availability.
- **SL-6** A count stores who counted, when, and the figure typed for each batch. If it differs from the balance, a `count_correction` movement for the difference is written in the same transaction, with a reason. The counter is not shown the expected figure before saving.
- **SL-7** A transfer between two points of one hospital writes `transfer_out` and `transfer_in` in one transaction. A request from another point is a row that names the medicine, the quantity and the line it is for; it is closed by a transfer or by a person, with a reason.
- **SL-8** Every movement carries the actor, the point, `effective_at`, `recorded_at`, a reason where the kind needs one, and the event that caused it (a supply, a count, a delivery reference).
- **SL-9** A **stock-out** is derived from the ledger: it starts at the movement that takes a medicine's unexpired total at a point to zero, and ends at the movement that lifts it. The projection is stored for Phase 2's reports and read by 5.5 and 6.4. A medicine that reaches zero only because its last batch expired has a stock-out that starts on the expiry date.
- **SL-10** Property tests: after any sequence of concurrent supplies, receipts and counts, every balance equals the sum of its ledger; no balance is below zero without a downtime entry behind it; no `supplied` movement exists without a supply event, and none in reverse.
- **SL-11** A batch's number or expiry is corrected only by a `batch_corrected` event that stores the old and the new value, the actor and a reason. Movements are untouched. For a controlled product it is witnessed.

### 6.4 Availability (`lib/prescribing/pharmacy.ts`, the seam of ADR 0190)

- **AV-1** `getAvailability({ medicineId, hospitalId, encounter })` returns `{ state, point, lastCountAt, lastReceiptAt, since, elsewhere }` where `state` is `not_linked` | `not_stocked` | `not_counted` | `out` | `low` | `in_stock`.
- **AV-2** The point that answers is the live point whose `serves` matches where the prescription is being written. If several match, the first in the hub's order answers and the others are listed in `elsewhere`. With none live, the state is `not_linked`, exactly as today.
- **AV-3** The states are tested in this order, and the first that holds is the answer:
  1. `not_stocked`: the medicine has no active product at the point;
  2. `not_counted`: any batch of the medicine at the point has a balance below zero; or the medicine has never been counted there and has no receipt on record; or its last count is older than the count-freshness setting, where the pharmacy in charge has set one;
  3. `out`: the unexpired total of the medicine's products at the point is zero. `since` is the start of the stock-out, or empty if there is none on record;
  4. `low`: the total is under the reorder level set for that medicine at that point. With no level set, a medicine is never `low`;
  5. `in_stock`.
- **AV-4** `lastCountAt` is the time of the last count, or empty. `lastReceiptAt` is the time of the last receipt. The dialog says "Counted {when}" only from a count; with a receipt and no count it says "Received {when}, not yet counted".
- **AV-5** `elsewhere` lists other live points of the hospital that hold it, by name. It never crosses hospitals.
- **AV-6** The function returns no quantity. No caller outside `app/pharmacy/**` can read one.
- **AV-7** The answer never blocks placing. Its level in the dialog (Note or Check) comes from a signed mapping.
- **AV-8** The state shown is stored with the prescription as a check outcome, with the point and the count time.
- **AV-9** The match is exact: the same medicine, form and strength. Another strength is never reported as availability.

### 6.5 Lanes (`lib/pharmacy/lanes.ts`)

- **LN-1** A lane rule is a signed, versioned set of **reasons** for one hospital. Each reason has a code, its wording, the stored fact it reads, and whether it is switched on. The proposed reasons are in Appendix D.
- **LN-2** A prescription is `pharmacist_first` when any active line matches any reason that is signed and switched on. Otherwise it is `standard`. The lane belongs to the prescription: **a pharmacist-first line is any active line of a pharmacist-first prescription**, whether or not that line matched a reason, because the pharmacist reviews the prescription as a whole.
- **LN-3** Every reason reads a fact that was **stored** at prescribing (a check that fired, an override, the controlled flag, the dose source) or signed data keyed to the medicine. The lane engine re-runs no prescribing check.
- **LN-4** With no signed lane rule in force, every prescription is `pharmacist_first`, and the queue says so. A point cannot go live without a signed rule (RD-1).
- **LN-5** A prescription with a controlled line is always `pharmacist_first`, whatever the rule says.
- **LN-6** Stock and payment never move a prescription between lanes.
- **LN-7** The lane, its reasons and the rule version are stored as a snapshot on the first review or supply event. A later change to the rule never rewrites it.
- **LN-8** When a prescriber adds or changes a line, the lane is worked out again for the prescription as it now stands. A prescription that becomes pharmacist-first needs acceptance of every line not yet supplied; a line at `ready` with no acceptance returns to `to_review`.

### 6.6 Line stages and outcomes (`lib/pharmacy/lines.ts`)

- **LO-1** Every active line of a prescription in scope has exactly one **stage**, derived from append-only events: `awaiting_cosign` · `to_review` · `queried` · `ready`, in that order from least to most advanced. Then it has an **outcome**.
- **LO-2** Outcomes.
  - Closed: `supplied` · `cancelled_by_prescriber` · `replaced` (the prescriber changed it; the new line starts again) · `declined` (a pharmacist declined to supply after a query) · `closed` (a person closed it, with a coded reason: not collected, patient declined, filled elsewhere, other) · `reviewed` (review-only ward lines, LO-6).
  - Open: `owed` · `buying_outside`. Each may carry a quantity already supplied (a part supply) and the quantity not supplied.
- **LO-3** A prescription is in the queue while any line has a stage. It leaves when every line has an outcome. A line with an open outcome is in Open lines until it reaches a closed one.
- **LO-4** The allowed moves are this table and nothing else. It is tested exhaustively.

| From                                                  | Event                                                                                                                   | To                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| a new line in scope                                   | the prescription needs a co-signature                                                                                   | `awaiting_cosign`                                                                  |
| a new line in scope                                   | no co-signature needed                                                                                                  | `to_review`                                                                        |
| `awaiting_cosign`                                     | the prescription is co-signed                                                                                           | `to_review`, or `queried` if a query on the line or the prescription is still open |
| `to_review`, `ready`                                  | a query is sent on the line, or on the whole prescription                                                               | `queried`                                                                          |
| `awaiting_cosign`                                     | a query is sent                                                                                                         | stays `awaiting_cosign`; the query is open beside it                               |
| `to_review`                                           | pharmacist-first: a pharmacist accepts the line · standard: a supply decision is saved · D-PH1-05: a reason is recorded | `ready`                                                                            |
| `to_review`, `ready`                                  | recorded as owed (a pharmacist-first line must first have been accepted, or carry D-PH1-05's reason)                    | `owed`                                                                             |
| `to_review`, `ready`                                  | recorded as buying outside (on the same condition)                                                                      | `buying_outside`                                                                   |
| `ready`                                               | the prescription becomes pharmacist-first and the line has no acceptance (LN-8)                                         | `to_review`                                                                        |
| `ready`                                               | hand-over of the full quantity                                                                                          | `supplied`                                                                         |
| `ready`                                               | hand-over of part, the rest owed                                                                                        | `owed`, with the quantity supplied                                                 |
| `ready`                                               | hand-over of part, the rest to buy outside                                                                              | `buying_outside`, with the quantity supplied                                       |
| `queried`                                             | answered "keep", in the app or by a logged phone call                                                                   | `to_review`, showing the answer                                                    |
| `queried`                                             | a query on the whole prescription is answered "changed", and this line was not changed                                  | `to_review`                                                                        |
| `to_review`, `ready`                                  | a phone answer is disputed and the query reopens (RQ-7)                                                                 | `queried`                                                                          |
| `queried`                                             | a pharmacist declines the line; the open query closes as withdrawn                                                      | `declined`                                                                         |
| `queried`                                             | the pharmacy withdraws the query, with a reason                                                                         | `to_review`                                                                        |
| `to_review`                                           | a pharmacist declines a line whose query was answered or withdrawn                                                      | `declined`                                                                         |
| any stage, `owed`, `buying_outside`                   | the prescriber changes the line                                                                                         | `replaced`; the new line enters as a new line                                      |
| any stage, `owed`, `buying_outside`                   | the prescriber cancels the line                                                                                         | `cancelled_by_prescriber`                                                          |
| `owed`, `buying_outside`                              | hand-over of all that was not supplied                                                                                  | `supplied`                                                                         |
| `owed`, `buying_outside`                              | hand-over of part of it                                                                                                 | the same open outcome, with the new quantities                                     |
| `owed`                                                | changed to buying outside                                                                                               | `buying_outside`                                                                   |
| `buying_outside`                                      | changed to owed                                                                                                         | `owed`                                                                             |
| `buying_outside`                                      | confirmed filled, by the pharmacy or by the patient                                                                     | `closed`: filled elsewhere                                                         |
| `owed`, `buying_outside`                              | a person closes it, with a reason                                                                                       | `closed`                                                                           |
| any stage, written before today                       | a person closes the prescription as not collected                                                                       | `closed`: not collected                                                            |
| `supplied`, or an open outcome reached by a hand-over | that hand-over is reversed the same day, or its supply is later marked "recorded in error"                              | the stage or open outcome it had immediately before                                |
| any stage, `owed`, `buying_outside`                   | a supply entered after downtime (DT-3)                                                                                  | `supplied`, or the open outcome the sheet shows for the rest                       |
| any stage                                             | a "not supplied" row entered after downtime (DT-9)                                                                      | `owed` or `buying_outside`, as the sheet shows                                     |
| `to_review`, review-only ward line                    | a pharmacist accepts the line                                                                                           | `reviewed`                                                                         |

- **LO-5** Nothing moves by the passing of time. A test advances the clock 30 days over a fixture and finds every stage and open outcome unchanged.
- **LO-6** **Scope.**
  - A window prescription is in scope when it was written at or after the time the hospital's first dispensing point went live, or when a person has brought it into the queue.
  - With individual inpatient supply off, a ward prescription is in scope only if it is pharmacist-first; its lines are review-only (`to_review`, `queried`, then `reviewed`). A standard-lane ward prescription is out of scope.
  - With individual inpatient supply on, ward prescriptions are in scope on the same terms as window prescriptions.
  - Emergency rows are never in scope (Phase 0, PQ-4).
- **LO-7** A line can be declined only if a query has been sent on its current version, whether that query is open, answered or withdrawn. Declining closes an open query, tells the prescriber and writes the patient wording for that outcome.
- **LO-8** Each outcome event carries the actor, the point, the time, the coded reason where the outcome needs one, the quantities, and what the patient was told.
- **LO-9** Property tests: every line in scope has exactly one stage or one outcome; no sequence of events makes a move outside the table; every line that ever left the queue has an outcome event; the quantities supplied across all supply events for a line never exceed what was decided for it.

### 6.7 Review and queries (`lib/pharmacy/review/**`)

- **RQ-1** A **review** is an event on one line version by a holder of `pharmacy.review`: `accepted`, or `accepted_overridden_stop` (which records that the pharmacist read the override reason). A standard-lane line needs none; its supply records `checked_at_supply`.
- **RQ-2** A **query** belongs to one line or to the whole prescription. It carries a coded type, the proposal text, the sender and the time. Its states: `not_sent` | `open` | `answered`; a dispute moves `answered` back to `open`. Events are append-only: `created`, `notified` (recipient, channel, outcome), `seen`, `call_logged`, `answered` (actor, answer, reason, via), `disputed`, `withdrawn` (actor, reason).
- **RQ-3** Recipients are resolved when sending and stored on the event: the prescriber, and the patient's current responsible clinician if different. A recipient who is deactivated or has left the hospital is skipped and listed as skipped. If nobody is left, the query is created `not_sent` and the pharmacy is told to call; a logged phone answer can still answer it.
- **RQ-4** Answers to a query about one line: `keep` (with a coded reason): the line returns to `to_review` showing the answer. `changed`: the prescriber changed the line through the prescribing action; the old line becomes `replaced` and the new one enters as a new line. `stopped`: the prescriber cancelled the line.
- **RQ-5** A query about the whole prescription puts every line at `to_review` or `ready` at `queried`; a line awaiting co-signature stays there with the query open beside it. `keep` returns them all to `to_review`. `changed` is recorded when the prescriber confirms **Changes made**: changed lines are `replaced`, and the others return to `to_review`. Changing one line does not close the query. `stopped` cancels every remaining line.
- **RQ-6** Any clinician who may prescribe for the patient at the hospital may answer. The first answer wins: every later attempt, by anyone, is shown the first and writes nothing. A repeat with the same client key is the same request.
- **RQ-7** A logged phone answer of "keep" from a clinician who may prescribe answers the query `via: phone`, naming that clinician and the pharmacy user who logged it. The clinician can dispute it, which reopens the query: a line at `to_review` or `ready` returns to `queried`; a line already supplied does not move, and the dispute is shown to a pharmacist on the look-back list. Any other phone answer is recorded as `call_logged` and changes no state.
- **RQ-8** `seen` is written when a recipient's client renders the query. It is never shown to the pharmacy as an answer.
- **RQ-9** A line changed by the prescriber voids every acceptance and every staged supply decision on the old version, in both lanes, and closes any open query on that line as `answered: changed`. If part of the old version was already supplied, the new line shows that quantity and date to the reviewer; nothing is carried into the new line's figures by the system.
- **RQ-10** There is no automatic escalation of a query in this slice. An unanswered query stays open and listed; the pharmacy calls. Delivery uses the channel Step 0 finds (E-PH1-06) and **never throws**.
- **RQ-11** A not-supplied notice to the prescriber is an event of the same family. It needs no answer.
- **RQ-12** Where D-PH1-05 is on, a pharmacist-first supply with no acceptance writes `supplied_without_review` with its coded reason, and stays on the look-back list until a holder of `pharmacy.review` records a look-back. A controlled line never takes this path. The setting itself can be switched on only with an answer to legal question 1 on record and a second approver; the server refuses otherwise.

### 6.8 Supply and hand-over (`lib/pharmacy/supply/**`)

- **SU-1** `recordHandover` is one transaction. For every line being supplied it writes one supply event and one `supplied` movement per batch; for every line it writes the outcome event; once, it writes the hand-over record (who collected, how identity was confirmed, label mode, what was explained and in which language, payment status). Where `pharmacyPatientList` is on, it also writes the patient's medicine-list entries. All of it commits, or none.
- **SU-2** The server takes a row lock on each prescription line and each batch, and refuses unless, for **every** line in the hand-over:
  - the prescription is co-signed where it needs to be, and not cancelled;
  - the line's current version is the one the decision was made on;
  - the line is at `ready` (or `owed` or `buying_outside`, for a supply of what was not supplied) and the quantity is no more than what is left to supply, where that is recorded;
  - a pharmacist-first line has an acceptance of that version, or a `supplied_without_review` reason where D-PH1-05 is on and the line is not controlled;
  - the batch is unexpired and holds the quantity;
  - the quantity is a whole number above zero in the product's issue unit;
  - the product belongs to the prescribed medicine, or SU-8 applies;
    and unless: identity is confirmed (SU-4); the actor holds `pharmacy.dispense`; the point is live; and payment status meets SU-12. A hand-over that includes a controlled line goes through 6.9. Entry after downtime is not a live hand-over: these refusals do not apply to it; DT-4 and DT-10 do.
- **SU-3** First expiry, first out: the proposed batch is the unexpired batch that expires first and holds stock. Where it holds less than the quantity, the proposal splits across batches in expiry order; each batch gets its own supply event and movement. Any other choice needs a coded reason.
- **SU-4** Identity. The first identifier is the full name, attested by the supplier. The second is the date of birth or the phone number on file, typed by the supplier and compared on the server after normalising spaces, date formats and phone formats. Neither stored value is sent to any pharmacy client. Each attempt is logged; after five wrong attempts on one hand-over the typed check is closed for it. In its place the supplier may record how the person was identified, from a short list with a note; this is stored with their name and listed for the pharmacy in charge. Where the collector is a member of ward staff (D-PH1-02), the route is `ward_staff`: the supplier picks the staff member from this hospital's staff and the ward, the typed check is not asked, and the hand-over records who collected.
- **SU-5** The collector is the patient, a representative (name and relationship as text), or, where D-PH1-02 is on, a member of ward staff chosen from this hospital's staff (SU-4).
- **SU-6** The quantity is pre-filled only from a structured quantity on the prescription. It is never derived from the dose text, the frequency or the duration.
- **SU-7** A part supply records the quantity supplied and the quantity not supplied, both entered by a person, and whether the rest is owed or to be bought outside.
- **SU-8** Substitution follows the signed rule. A different pack of the same strength: any holder of `pharmacy.dispense`. A different strength, where the rule allows: a holder of `pharmacy.review`, a coded reason, and the pharmacist's line as typed. The supply stores the prescribed strength, the supplied strength, the pharmacist's line and who wrote it. The label and the patient's list print that line, marked. The prescriber is informed. The system computes nothing.
- **SU-9** The supply event stores the dispensing point and the organisation that supplied, as their own fields. Nothing in the model assumes they are the prescription's hospital.
- **SU-10** Idempotency: a repeated call with the same client key returns the existing hand-over. A double tap writes one. Two different hand-overs of the same line are stopped by SU-2's line lock, not by the client key.
- **SU-11** A reversal is a new event naming the hand-over or the supply. It writes a `reversed` movement that returns the quantity to its batch; if the pack is not fit, it also writes an `adjusted` movement that takes the same quantity out again, with the reason, in the same transaction. The line returns to the stage or open outcome it had immediately before that hand-over. The list entry is withdrawn and the prescriber informed. It is allowed on the hospital-local day the supply was recorded.
- **SU-12** Payment status is `paid` | `exempt` | `insured` | `emergency` | `not_recorded`, with its detail. It may be set from the review screen or at hand-over; the hand-over stores the status as it then stood. Where the hospital requires a status, `not_recorded` is refused. `emergency` is never refused.
- **SU-13** A failure of any notification, label print or message after commit never undoes the hand-over, and is shown to the supplier in words.
- **SU-14** `correctSupplyRecord` marks a supply "recorded in error", with a reason. It moves no stock, withdraws the list entry, informs the prescriber and leaves the supply in the record. The line returns to the stage or open outcome it had immediately before that hand-over, as in SU-11, so that the right supply can still be made.

### 6.9 Controlled drugs (`lib/pharmacy/controlled.ts`)

- **CD-1** A line is controlled when the prescription's `controlled` flag is set, or the medicine carries a signed controlled class. The class is shown only from signed data. With no signed class, the full path applies and no class is named. Before a point goes live the pharmacist reviewer signs a decision for every medicine it stocks, "not controlled" included (RD-1), so that a medicine prescribing does not flag is still caught.
- **CD-2** `recordControlledSupply` needs: an actor with `pharmacy.controlled`; a pharmacist's acceptance of every line; a witness who is a different user, on the signed witness list, authenticated with their own factor; a count of each batch of the controlled product, committed with that witness present; and both paper attestations. It records the whole hand-over, controlled and other lines together, in one transaction, under SU-1 to SU-4.
- **CD-3** The witness is authenticated first. The count is per batch. The figures the supplier typed are written as a witnessed count event **before** MedSync's balance is returned to the client; they cannot be retyped, and a second count is a second event. A count stands in the record even if the supply is then abandoned. If a batch's count differs from its balance, a `controlled_difference` event records both figures, the supplier and the witness, and is listed for the pharmacy in charge until they close it with a note. A `count_correction` movement brings that batch to the counted figure, witnessed. The supply then proceeds from the counted figure.
- **CD-4** A controlled line is never offered `buying_outside`, never supplied from the standard lane, never covered by D-PH1-05's exception, and never printed on the slip.
- **CD-5** Receiving a controlled product, counting it, adjusting it, transferring it, correcting its batch details, reversing a supply of it and marking one "recorded in error" each need the action's own permission (Section 8), **and** `pharmacy.controlled`, **and** a witness, on the same terms. Until Step 7 is built, a product of a controlled medicine cannot be added or received.
- **CD-6** The controlled-drug page is a read of the ledger for one medicine at one point, with the witness on every row. Its running balance equals `balance()` at every row (tested).
- **CD-7** Nothing in this engine marks the statutory paper as done. The two attestations record what the supplier said, with their name.
- **CD-8** Where the prescription changed since it was last printed, the supply screen says so, and the first attestation is that the signed paper matches the screen.

### 6.10 Labels and paper (`lib/pharmacy/print/**`)

- **LB-1** A label is rendered from one supply event (one batch) and its prescription line, with the fields and order GATE A signs. The supplier's name and address on the label come from the hub's record of the hospital and the dispensing point.
- **LB-2** The directions on a label are the stored directions, byte for byte. Under them, where a strength was changed, the pharmacist's line as stored, marked _"From the pharmacist"_. Where the prescription holds structured parts **and** a signed plain-words template covers them, a line in plain words is printed, built from the stored parts and the template's words. No number on a label comes from anywhere but the prescription or the supply.
- **LB-3** Additional instructions and warning lines come only from signed lists.
- **LB-4** Print is CSS only. A print and a reprint are logged with the actor. No PHI goes into a file name or a URL.
- **LB-5** The slip to fill elsewhere renders only lines whose outcome is `buying_outside`, with the quantity not supplied or the words "as on the prescription", and never a controlled line.
- **LB-6** The verification code is random, at least 8 characters from an unambiguous alphabet, unique per slip, and carries no patient information. It resolves only for pharmacy staff of the issuing hospital, through Find a prescription. For anyone else the answer is the same as for an unknown code.
- **LB-7** The controlled register slip prints the entry's facts for copying. Its heading is _"Copy for the controlled drugs register. This is not the register."_

### 6.11 The patient's medicine list, the refill date and messages

- **ML-1** Each supplied line writes one entry to the patient's list through the tracker's own contract (Step 0, Q13), however many batches it came from: the medicine, form and strength as supplied, the directions as written, the pharmacist's line if any, the total quantity, the date and the supplying hospital. The entry names its source.
- **ML-2** A line with an open outcome, and a declined line, show as not given, with the signed patient wording for that outcome.
- **ML-3** A refill date exists only when the dispenser recorded the days the supply covers, or the prescription carries a structured duration and the line was supplied in full. It is the supply date plus those days, shown as "around {date}". Otherwise there is no date, and nothing is estimated.
- **ML-4** _I have bought it_ closes a `buying_outside` line as `closed: filled elsewhere, reported by the patient`. _I could not get it_ writes an event, keeps the line open, marks it in Open lines and informs the prescriber.
- **ML-5** `getRefillStatus(patientId)` returns, per medicine with a refill date, `not_due` | `due` | `overdue`, from supply events only. The NCD recall list reads it if the registry is on the branch; otherwise the function and its tests stand as the seam.
- **ML-6** A reversal or a correction of the record withdraws the entry.
- **MS-1** One renderer per channel takes the message kind, the hospital's message name and the pharmacy's phone number. It is given nothing else.
- **MS-2** The banned-term scan runs in CI over every template and rendered fixture: every catalogue medicine name and synonym, every product name, every clinic, department and dispensing-point name, fixture patient names, MedSync-number patterns, digits beside a unit, and the restricted-class terms. Any match fails the build.
- **MS-3** SMS goes only from an approved template, only when the hospital's live-sending setting is on, only to the patient's own number on file, once per event. The basis in data-protection law is recorded before live sending is switched on (Appendix E, question 7).
- **MS-4** The "in stock today" message is sent only by `notifyOwedInStock`, a person's action, and only while the medicine is on the shelf at that point. Nothing sends it automatically.
- **MS-5** A message failure never throws and is shown to the pharmacy.

### 6.12 Downtime and the dispensing log

- **DT-1** If the lab's downtime module is on the branch, generalise it once (sheet numbers, periods, drills) with the lab's behaviour proved unchanged, as Phase 0 did for access. If it is not, build the workspace-neutral module here and record that the lab adopts it. **Never two.**
- **DT-2** Sheet numbers are reserved on the server in runs, unique per hospital. A sheet is `unused`, `to_enter`, `complete` or `voided`. Recording a downtime names the sheets used, which become `to_enter`. Each sheet's rows are numbered; a row is entered once; **Sheet complete** closes the sheet.
- **DT-3** A back-entered supply is written through `recordHandover`'s transaction with `supplied_at` from the sheet, `entered_at` from the server, the sheet and row number and `entered_after_downtime = true`. Its movement's `effective_at` is the sheet's time.
- **DT-4** Validation that refuses, because the record itself would be impossible: a time in the future; a time outside every recorded downtime period; a patient who is not registered; a row already entered; a quantity that is not a whole number above zero. Recording a downtime period needs `pharmacy.manage`.
- **DT-5** A supply against a paper prescription is stored with a `paper_prescription` record: the patient, the prescriber's name and cadre as text, the date, and each line as transcribed, with who transcribed it. **No row is created in the prescriptions table.** The patient's list marks it as transcribed.
- **DT-6** Identity on a back-entered row is recorded as written on the sheet: checked, not checked or not recorded. The server's comparison in SU-4 does not run, because the person has gone.
- **DT-7** Back-entry may take a batch below zero. The movement is recorded; the medicine shows _Count needed_; availability returns `not_counted` until a count.
- **DT-8** A back-entered controlled supply stores the witness's name as text and the register attestation, and is listed on the Controlled drugs page until a holder of `pharmacy.controlled`, with a witness, confirms it against the register.
- **DT-9** A "not supplied" row is written as that line's outcome, with the sheet's time and reason. For a paper prescription it is stored on the paper-prescription record.
- **DT-10** Back-entry never refuses a supply for a reason SU-2 would have refused a live one, because the medicine has already been handed over. It evaluates those checks against the sheet's time and writes a `needs_look_back` flag with each reason that applies: identity not shown as checked; a pharmacist-first prescription with no pharmacist's initials; a prescription that was awaiting co-signature or cancelled at that time; a line whose version changed before that time; a batch that had expired by that time; a product that is not of the prescribed medicine; a line that already has a supply on record, which may be a double supply. Each flagged supply is on the look-back list (5.7) until a holder of `pharmacy.review` records a look-back.
- **DT-11** A drill writes a drill record and nothing else.
- **DL-1** `getDispensingLog(point, date)` returns the day's supply events as rows, one per batch supplied. The **column map** (which fact goes in which column of the hospital's HMIS 016 book, and in what order) is per-hospital data confirmed by the pharmacy in charge. The log prints with a "not yet confirmed" line until it is.
- **DL-2** Back-entered rows appear on the day they were supplied, marked as entered afterwards. A reversed supply, and one recorded in error, appear struck through with the reason.
- **DL-3** The row count of the printed log equals the count of supply events for that point and day (tested).

### 6.13 Readiness and check state

- **RD-1** `pharmacyReadiness(hospital, point)` returns six conditions with their evidence:
  1. signed content in force: the permission map; the lane rule; every reason and code list in Appendix D; the substitution rule; label fields and wording; counselling points; the staff-facing copy in Appendix B; the witness list; and a controlled-class decision for every medicine the point stocks;
  2. an interim answer on record for legal questions 1 to 6 in Appendix E: a document reference, who gave it and the date;
  3. stock set up: every active product at the point has an opening count;
  4. a downtime drill recorded at this point;
  5. a briefing recorded for pharmacy staff and for prescribers;
  6. an in-charge named for the point in the hub (a pharmacist, if the answer to legal question 1 requires one).
- **RD-2** The switch needs all six and a second approver. It is one audited transaction that stamps the point live.
- **RD-3** Switching a point off returns it to the Phase 0 read-only view, plus its Open lines page, where what it left open can still be supplied elsewhere, confirmed or closed. It needs a reason and a second approver. Lines at a stage in its queue stay in scope and can be handled from any live point.
- **RD-4** In production, `pharmacyPatientList` and live SMS cannot be switched on for a hospital while any string or template a patient reads is `draft` or unapproved, or while the hospital has no signed message name.
- **RD-5** A second or later point at a hospital also needs a recorded note on how the first point's pilot went, written by someone other than the requester.
- **CK-1** `pharmacyChecksState` keeps its callers and its Phase 0 rules. `dispensingRecorded` is now true for a hospital with a live point, and the function also reports, per point, whether it is live.
- **CK-2** `interactionsChecked` stays false. The notice stays on every review surface.

---

## 7. Data changes (only what GATE A approves; additive; numbers from the ledger)

Claim a block in `docs/NUMBERS.md` before writing any migration or ADR: 25 migration numbers and 20 ADR numbers above the highest on `main` and on every open branch. Names below are proposals; follow the repo's naming.

**Access**

- The permission map, version 2, as signed reference data. Audit kinds for each grant and revocation of the five permissions.

**Catalogue and signed content**

- `pharmacy_products` (hospital, medicine, name, manufacturer, pack size, issue unit, registration number, price, active) and `pharmacy_product_points` (product, dispensing point, active, added at the window or not).
- National-list reference rows for medicines (edition, level of care, class), imported and versioned.
- Signed, per-hospital, versioned sets, through the signed-reference mechanism if it can hold them (E-PH1-07): the lane rule and its reasons · the high-risk list · controlled-class decisions · the witness list · outcome and close reasons · reversal, adjustment, batch-choice, supply-without-a-pharmacist, payment-exemption, strength-change and query-withdrawal reasons · identity routes · query codes and answer reasons · the substitution rule · label fields, warning lines and additional instructions · plain-words templates · counselling points · staff-facing and patient-facing copy · the hospital's message name · the availability-level mapping.

**Stock**

- `pharmacy_batches` (product, batch number, expiry, dispensing point).
- `pharmacy_stock_movements` (append-only by trigger: kind, batch, point, signed quantity, `effective_at`, `recorded_at`, actor, reason, source event, witness).
- `pharmacy_counts` and their per-batch figures · `pharmacy_reorder_levels` (medicine, point, level, set by) · `pharmacy_stock_requests` · `pharmacy_batch_corrections` (old and new batch number or expiry, actor, reason, witness).

**Review, queries, outcomes**

- `pharmacy_line_events` (append-only: review, stage and outcome events per prescription line, with the line version they refer to, the lane snapshot and the rule version).
- `pharmacy_queries` and `pharmacy_query_events` (append-only).

**Supply**

- `pharmacy_handovers` (collector, how identity was confirmed, label mode, counselling, language, payment status and detail, point, actor, client key, `entered_after_downtime`, sheet number, `supplied_at`, `entered_at`).
- `pharmacy_supplies` (append-only: hand-over, prescription line or paper-prescription line, product, batch, quantity, issue unit, the line version it was decided on, days covered, price snapshot, prescribed and supplied strength, substitution reason, the pharmacist's line and who wrote it, reviewer event, supplying point, supplying organisation).
- `pharmacy_supply_reversals` · `pharmacy_supply_corrections` ("recorded in error") · `pharmacy_look_backs` (the supply, each reason it was flagged, who looked and when) · `pharmacy_identity_attempts` · `pharmacy_print_events` · `pharmacy_slips` (verification code, lines, copy count) · `pharmacy_patient_notices` (the "in stock today" message: who sent it and when).

**Controlled drugs**

- `pharmacy_controlled_entries` (supply or movement, count before, attestations, witness, how the witness was authenticated) and `pharmacy_controlled_differences`.

**Downtime**

- The shared downtime tables (DT-1), and `paper_prescriptions` with `paper_prescription_lines`.

**Going live**

- On the dispensing point: `live_at`, `switched_off_at`, `label_mode`, a count-freshness setting, the phone number if the hub does not hold one. `pharmacy_golive` (conditions snapshot, approvers, for each switch on and off) · `pharmacy_briefings` · `pharmacy_legal_answers` · `pharmacy_pilot_notes`.
- Hospital settings: individual inpatient supply · payment status required · supply without a pharmacist (D-PH1-05) · the expiry look-ahead · live SMS · the message name. The time the hospital's first point went live (LO-6) is derived, not stored twice.

**Prescribing and the patient**

- The stock answer is stored through the existing check store. Add a column to a prescription table **only** if Step 0 proves the store cannot hold it, and only with GATE A's approval.
- Entries on the patient's medicine list through the tracker's own tables, with a source field if it lacks one.
- Message templates for the three kinds, in the existing template store.

**Realtime**

- The existing PHI-free per-user channel, if Step 0 finds one. No new channel type.

**No change** to how a prescription is written, co-signed, changed, cancelled or printed, or to the administration record.

**RLS probes** for every new or changed object:

| Actor                                                                                                           | Access                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Pharmacy staff, same hospital, with the permission the action needs                                             | As Section 8's table allows                                                                                               |
| Any pharmacy staff, any read                                                                                    | No stored date of birth or phone number is returned                                                                       |
| Pharmacy staff with `pharmacy.view` only                                                                        | Read of queue, lines, outcomes and stock states; no write                                                                 |
| Pharmacy staff without `pharmacy.review`                                                                        | Review events: read-only                                                                                                  |
| Pharmacy staff without `pharmacy.controlled`                                                                    | Controlled entries: read-only; may be a witness if the signed list says so                                                |
| Prescriber, same hospital, who may prescribe for the patient                                                    | Queries, answers and outcomes for that patient: read, and answer. No stock quantity. No pharmacy staff name beyond cadre  |
| Nurse, same hospital                                                                                            | The review state of an inpatient line, through the server function. Nothing else                                          |
| The patient                                                                                                     | Their own medicine-list entries and their own open lines, through the patient read. No stock, no staff names beyond cadre |
| Reception, lab staff                                                                                            | Denied                                                                                                                    |
| Hospital admin                                                                                                  | The go-live page and dispensing-point settings only. No PHI, no stock movement                                            |
| Staff of another hospital                                                                                       | Denied                                                                                                                    |
| Superadmin without break-glass                                                                                  | Denied                                                                                                                    |
| Anonymous                                                                                                       | Denied                                                                                                                    |
| Any client, direct INSERT, UPDATE or DELETE                                                                     | Denied everywhere                                                                                                         |
| Any actor, UPDATE or DELETE on movements, supplies, hand-overs, line events, query events or controlled entries | Denied, including the service-role path                                                                                   |

## 8. Server actions

The house contract applies to every write: `'use server'` → Zod with an idempotent client key → auth (`getUser()`, never `getSession()`) → AAL2 → permission → hospital and dispensing-point check (PA2-4) → one transaction → PII-redacted log → audit row → `{ id, serverTime }`. **Notification, print and message failures never throw.**

Appendix A signs the permission column of this table. An action not listed here does not exist.

| Group               | Action                                                                                                                                                                                                                                                                                                    | Who may call it                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Review              | `acceptLine` · `acceptRemainingLines` · `declineLine` · `recordLookBack`                                                                                                                                                                                                                                  | `pharmacy.review`                                                                                                                     |
| Review              | `saveLineDecisions` (stages supply decisions; moves no stock) · `setPaymentStatus` · `bringIntoQueue`                                                                                                                                                                                                     | `pharmacy.dispense`                                                                                                                   |
| Review              | `recordSupplyWithoutReview` (only where D-PH1-05 is on)                                                                                                                                                                                                                                                   | `pharmacy.dispense`                                                                                                                   |
| Queries, pharmacy   | `sendQuery` · `logPhoneAnswer` · `withdrawQuery`                                                                                                                                                                                                                                                          | `pharmacy.dispense` or `pharmacy.review`                                                                                              |
| Queries, prescriber | `answerQuery` · `confirmChangesMade` · `disputePhoneAnswer` · `recordQuerySeen` · `acknowledgeNotSupplied`. Changing or stopping a line uses the **existing** prescribing actions                                                                                                                         | the prescribing permission, for that patient                                                                                          |
| Outcomes            | `recordNotSupplied` (owed, buying outside) · `changeOpenOutcome` (owed to buying outside, or back) · `confirmFilledElsewhere` · `closeLine` · `closePrescriptionNotCollected` · `printSlip`                                                                                                               | `pharmacy.dispense`. On a pharmacist-first line, `recordNotSupplied` is refused until the line has an acceptance or D-PH1-05's reason |
| Supply              | `recordHandover` · `checkSecondIdentifier` · `recordIdentifiedAnotherWay` · `printLabels` · `reprintLabels`                                                                                                                                                                                               | `pharmacy.dispense`                                                                                                                   |
| Supply              | `reverseSupply`                                                                                                                                                                                                                                                                                           | `pharmacy.manage` or `pharmacy.review`                                                                                                |
| Supply              | `correctSupplyRecord`                                                                                                                                                                                                                                                                                     | `pharmacy.manage`                                                                                                                     |
| Controlled          | `recordControlledCount` · `recordControlledSupply` · `confirmBackEnteredControlledSupply` · `printRegisterEntry`                                                                                                                                                                                          | `pharmacy.controlled`, with a witness                                                                                                 |
| Controlled          | Any stock action below, `reverseSupply` or `correctSupplyRecord`, when the product is controlled                                                                                                                                                                                                          | the action's own permission, **and** `pharmacy.controlled`, **and** a witness (CD-5)                                                  |
| Controlled          | `closeControlledDifference`                                                                                                                                                                                                                                                                               | `pharmacy.manage`                                                                                                                     |
| Stock               | `receiveStock` · `addBatchFoundOnShelf` · `recordCount` · `adjustStock` · `transferStock` · `requestStock` · `closeStockRequest` · `addProduct`                                                                                                                                                           | `pharmacy.stock`                                                                                                                      |
| Stock               | `setProductPrice` · `setReorderLevel` · `setCountFreshness` · `correctBatchDetails` · `confirmLogColumns`                                                                                                                                                                                                 | `pharmacy.manage`                                                                                                                     |
| Patient             | `reportBoughtOutside` · `reportCouldNotGet`                                                                                                                                                                                                                                                               | the patient, for their own line                                                                                                       |
| Messages            | `notifyOwedInStock`                                                                                                                                                                                                                                                                                       | `pharmacy.dispense`                                                                                                                   |
| Downtime            | `reserveSheetNumbers` (prints the sheets) · `enterDowntimeRow` · `completeSheet` · `recordDrill` · `printDispensingLog`                                                                                                                                                                                   | `pharmacy.dispense`                                                                                                                   |
| Downtime            | `recordDowntime` · `voidSheetNumber`                                                                                                                                                                                                                                                                      | `pharmacy.manage`                                                                                                                     |
| Going live          | `getPharmacyReadiness` · `recordBriefing` · `recordLegalAnswer` · `recordPilotNote` · `requestGoLive` · `approveGoLive` · `requestSwitchOff` · `approveSwitchOff` · `updatePharmacySettings` (inpatient supply, payment status required, supply without a pharmacist, live SMS, message name, label mode) | hospital admin, with a second approver for the switches and for "supply without a pharmacist"                                         |
| Signed content      | A save-draft and a sign action for each set in Section 7. Signing needs a fresh second factor and the signers in D-PH1-36                                                                                                                                                                                 | as D-PH1-36 names                                                                                                                     |
| Reads               | `getPharmacyQueue` (extended) · `getReview` · `getOpenLines` · `getSuppliedToday` (with its "identified another way" filter) · `getLookBack` · `getStock` · `getControlledRegister` · `getDispensingLog`                                                                                                  | `pharmacy.view`                                                                                                                       |
| Reads               | `getAvailability` · `getLineReviewState` (for the ward chip) · `getRefillStatus`                                                                                                                                                                                                                          | each through its own server function, to the caller named in 6.4, PA2-5 and ML-5                                                      |

---

## 9. Steps and gates

**Three merges, one go-live.** Steps 0 to 6 are the first merge. Steps 7 and 8 are the second. Step 9 is the third. Between merges the slice runs at the test hospital only: a production point cannot be switched on until the second merge, because the switch itself, the controlled-drug record and downtime are built there. Until Step 7 is built, a controlled line can be reviewed and queried and has no supply decision; it says _"Supply this on paper as you do today. MedSync does not record controlled supplies yet."_, and a product of a controlled medicine cannot be added or received. Until Step 8 is built, live points, hospital settings and legal answers are set by test fixture, never by hand in the database.

### Step 0: Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** Has `feat/pharmacy-front-door` merged? Are the permissions, `computeQueue`, the read model, the navigation registration, `pharmacyChecksState`, the read log and the flag present? **If not, STOP.**
- **Q2** R1 to R18: confirm or correct each, with file and line.
- **Q3** The prescription model today. What groups the lines of one prescription. Every column. Which parts of the directions are structured (dose, unit, route, a frequency code, duration, quantity) and which are text. Every state and what moves a row between them.
- **Q4** How a prescriber changes or cancels a line: is the old version kept, and how is it addressed? **If an edit overwrites a line with no history, STOP and report**: RQ-9, SU-2 and Law 2 depend on line versions.
- **Q5** The check store: where each prescribing check's outcome, answer and override reason is kept, per line. The name the dialog gives each check (the lane reasons quote them). Can the store hold one more outcome (the stock answer) with no schema change?
- **Q6** The prescribing list: its table, whether ids are stable, whether a prescriber can type a medicine that is not on it, its fields, its row count per hospital, anything that keys it to the national list, and where the `controlled` flag comes from. Over the last 30 days at the test hospital, how many prescription lines name a medicine that is not a list row?
- **Q7** For those 30 days, the share of prescriptions each proposed lane reason (Appendix D) would catch, alone and together. This table goes in front of the CSO at GATE A (D-PH1-04).
- **Q8** Dispensing points: do they exist, how are staff assigned, in what order does the hub list them, and does the hub hold the hospital's address and a phone number for each point? **If there are no dispensing points, STOP and report**, with the option of a minimal table owned by the pharmacy.
- **Q9** The witness mechanism behind `emergency_administrations`: how the witness proves who they are, and whether it can be reused as it is.
- **Q10** Delivery: which realtime channels exist and how they are authorised; whether a PHI-free per-user channel is on the branch; the polling pattern; whether the lab's criticals delivery has merged.
- **Q11** SMS: the provider interface, the template store and its two-person approval, the live-sending setting, the banned-term scan. Where the patient's phone number and any contact consent are held.
- **Q12** The four-eyes mechanism and the signed-reference mechanism: their contracts. Can the second hold per-hospital, versioned sets with two signatures?
- **Q13** `/patient/track/medications`: is it a web route, an Expo screen or both? Its tables, how an entry is created today, and the contract for adding an entry from a supply. The state of Gate CG. **If the list exists only in the Expo app, say so; Step 9 then builds the data contract and no patient screen.**
- **Q14** `/nurse/mar`: what it reads, how an inpatient medicine links to its prescription line, and where a read-only chip can mount.
- **Q15** The doctor's problem card and the plan step: where a chip, a count and an answer form can mount. The lane registry.
- **Q16** How the prescriber and the patient's current responsible clinician are resolved from a prescription. How often either is missing on recent prescriptions.
- **Q17** Patient identifiers: where name, date of birth, phone number and MedSync number are held, how they are encrypted, and how the server can compare a typed value (SU-4) without sending the stored one to the client. Whether Phase 0's read model sends a date of birth or a phone number to pharmacy clients (it must not). How many patients with a prescription in the last 30 days have neither a date of birth nor a phone number.
- **Q18** Restricted classes on medicines and problems: how they are tagged and filtered today.
- **Q19** The lab's downtime module: merged or not, and whether it is lab-specific (DT-1).
- **Q20** Print styles on the branch, whether print events are recorded, and whether Phase 0 built "Changed since printing" (PQ-7). Whether any PDF dependency exists (none is to be added).
- **Q21** Whether the branch has a presence signal (who is signed in and active, by workspace) that 5.3's "supply without a pharmacist" control can read. If not, say so; the control then relies on the reason and the look-back.
- **Q22** Playwright, axe, a fake-clock utility and a way to run two transactions at once in a test. If Playwright or axe is missing, STOP and flag.
- **Q23** The highest migration and ADR numbers on `main` and every open branch, and the block claimed.
- **Q24** The design tokens for the amber caution pair, the neutral chip and the place colour. Are Chroma tokens present?
- **Q25** Whether the server client still reads a legacy `service_role` key. If so, flag it.

**Baseline:**

- Screenshots: the Phase 0 queue and prescription view; the prescribing dialog's Check step showing "Pharmacy not linked yet"; a problem card with a prescribed line; the administration record; the patient's medicine list. At 390×844, 834×1194 and 1440×900 where the surface is responsive.
- A scripted run, the "before": a doctor places three medicines for an outpatient; record what the pharmacy, the doctor and the patient can each see an hour later, and what any of them can tell about whether the medicines were supplied.
- **Failing tests** that reproduce the gap: a prescription has no recorded outcome; the availability seam answers `not_linked` at a hospital that holds stock. Do not fix them yet.

**STOP 0.** Report Q1 to Q25, the prompt-versus-repo differences, the failing tests and the baseline.

### Step 1: GATE A proposal (documents only)

Write `docs/pharmacy/phase-1/gate-a-proposal.md`:

- annotated wireframes of every screen in Section 5, starting from the canvas, with each difference in 5.14 drawn as built;
- LO-4's table as a diagram, with one worked example per move and the two-point race drawn out;
- the lane rule with Q7's counts, and the same fixture prescriptions sorted under two alternative sets of reasons;
- the ledger model with a worked day at one dispensing point: a receipt, six supplies, a split across two batches, a count that differs, an adjustment, a transfer, a reversal of a pack that is fit and of one that is not;
- the query model, the recipients with real examples, and what the pharmacy sees for each delivery outcome;
- the schema diff, the RLS probe plan, and the plan for testing concurrent supplies;
- **the sign-off packs** (Appendix D): blank templates with the sources to consult. **Propose no clinical values.** Reasons, codes and wording may be drafted for signature;
- **the legal sheet** (Appendix E): each question, the interim answer on record if any, who gave it, and what the build does differently depending on the answer;
- every string in Appendix B, with its status;
- **the hazard log** (Appendix C), each hazard with its cause, effect, control, the test that proves the control, and the residual risk;
- the test plan, the rollout plan per flag and per dispensing point, and the ADR drafts;
- the decision table (Section 14) with a signature block for the CSO and for the pharmacist reviewer.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions, a named pharmacist reviewer, and an interim answer on record for legal questions 1 to 6.

### Step 2: Data layer

Approved migrations, the append-only triggers, the permission map version 2 with its grant, revocation and backfill (dry run only until told), the flags, the settings, the signed-content stores, the national-list import (dry run with its unmatched list), and the RLS probes.

**STOP 2.** The migration diff; the RLS probe table (every object × every actor); the append-only proof for each event table, including the service-role path; the backfill dry-run list; the import's matched and unmatched counts.

### Step 3: Engines (pure, no UI)

Sections 6.1 to 6.13 with tests:

- every rule ID covered;
- the exhaustive test of LO-4's table, the 30-day clock test (LO-5) and the property tests (LO-9, SL-10);
- concurrent supplies of the last units of a batch: exactly one succeeds;
- two hand-overs of the same line at two points with different batches: exactly one succeeds;
- an injected failure after the supply row and before the movement: neither exists afterwards;
- first-expiry selection and the split across batches, including an expired first batch and a month-only expiry;
- lane tests for every reason on and off, the no-signed-rule case, and a changed line (LN-8);
- availability tests for every state in AV-3's order, each pair of states that can hold together, and a test that no quantity leaves the function;
- the byte-equality test for directions on the screen, the label and the slip (awkward strings: mixed units, trailing spaces, a decimal comma);
- the banned-term scan with fixtures that must fail (a medicine name, a clinic name);
- the two-hospital fixture for every list, resolver and projection;
- the no-prescription-write test (Law 2).

**STOP 3.** Test counts, the rule coverage table, the property-test and concurrency results.

### Step 4: Stock at the dispensing point (behind `pharmacyDispensing`)

Products, receive, count, adjust, transfer, requests, reorder levels, the Stock page and its detail panel. Stock set-up works at a point that is not yet live; supply does not.

Scenarios:

- **S1** A holder of `pharmacy.stock` receives a product with a batch and an expiry. The balance is the quantity; the ledger holds one row.
- **S2** A blind count that matches records "matched". A count that differs shows both figures, takes a reason and writes a correction.
- **S3** An adjustment without a reason is refused. With one it is recorded and the balance moves.
- **S4** An expired batch shows "Expired, remove" in amber, is not offered for supply and does not count as stock.
- **S5** A transfer to another point writes both movements. With a failure injected between them, neither exists.
- **S6** A batch number already at the point with a different expiry is refused, with both shown.
- **S7** A medicine with no product at the point says so, and a holder of `pharmacy.stock` can add one. A medicine with no reorder level is never "Low".
- **S8** A batch found on the shelf is added with a reason and can then be chosen.
- **S9** A viewer with `pharmacy.view` only reads the page and can write nothing. A direct client write to the ledger is denied; an UPDATE or DELETE is denied for every actor.
- **S10** A pharmacist of another hospital sees none of it.
- **S11** A mistyped expiry is corrected by the in-charge. The old value stays in the record; no movement changed.

**STOP 4.** Scenario results; screenshots against artboard 1.6; the opening-count progress for the test point.

### Step 5: Review, queries and outcomes

The queue with its lanes, the review screen, the query and the prescriber's answer, not on the shelf, the slip, Open lines, closing. Nothing in this step moves stock.

Scenarios:

- **S12** Fixture prescriptions land in the lane the signed reasons give. With no signed rule, every prescription is pharmacist-first and the queue says so.
- **S13** A pharmacy technician opens a pharmacist-first prescription: read-only, "Waiting for a pharmacist". A forged `acceptLine` is refused on the server, and so is a forged `recordNotSupplied` on a line no pharmacist has accepted.
- **S14** A pharmacist reads an overridden allergy stop and chooses "Reason accepted, supply"; the event records that the override reason was read. "Accept the remaining lines" takes the unflagged lines and leaves any flagged line untouched.
- **S15** A pharmacist sends a query on one line of three. That line is "Queried"; a decision can still be saved on the other two. The prescriber's open workspace shows the query within the budget.
- **S16** The prescriber keeps the line as written with a reason. It returns to "To review" showing the answer.
- **S17** The prescriber changes the line. The pharmacy sees the old line struck through and a new one to review; the earlier acceptance no longer counts.
- **S18** The prescriber stops the medicine. The line's outcome is cancelled by the prescriber.
- **S19** A query about the whole prescription puts every line that is to review or ready at "Queried". Changing one line does not close it. "Changes made" does: the changed line is replaced and the others return to "To review".
- **S20** Delivery is made to fail. The query exists; the pharmacy sees "The prescriber has NOT been told"; nothing threw.
- **S21** No recipient can be resolved. The query is created as not sent; the pharmacy is told to call; a logged phone "keep" answers it. In a second run nobody can be reached: the pharmacy withdraws the query with a reason, the line returns to "To review", and it is recorded as owed.
- **S22** A phone "keep" is logged. The query is answered `via: phone`. The named clinician disputes it; it reopens and the line returns to "Queried".
- **S23** A second clinician answers a query the prescriber left. A third person's attempt is shown the second's answer and writes nothing.
- **S24** A line is recorded as owed. It appears under Open lines. Stock is received; "Supply now" appears. Nothing was supplied by the system.
- **S25** A line is recorded as buying outside. The slip prints with the code and the signed wording. The code opens the slip's record for this hospital's pharmacy staff and answers "no prescription" for another hospital's. The prescriber's card shows the line. A controlled line was never offered this choice.
- **S26** An owed line is changed to buying outside; the slip prints. A bought-outside line is changed back to owed.
- **S27** A line is returned to the prescriber. It is "Queried" and stays in the queue. The doctor chooses an alternative; the old line is replaced and the new one enters review. In a second run the doctor leaves it; the line returns to "To review" with the answer, and the pharmacy chooses again.
- **S28** A prescription awaiting co-signature opens, can be read and queried, and has no supply decision. After co-signature its lines are "To review".
- **S29** A pharmacist cannot decline a line that has not been queried. After the prescriber answers "keep", the pharmacist declines the line with a reason; the prescriber is told. In a second run the pharmacist declines while the query is open; the query closes.
- **S30** The clock moves 30 days. Every open stage and outcome is still listed. A person closes one prescription as not collected, with a reason.
- **S31** The pharmacy confirms a bought-outside line as filled. Who said so is stored; the line is closed.
- **S32** A prescription written before the hospital's first point went live is not in the queue. It is found through Find a prescription, and "Bring into the queue" puts it in scope.
- **S33** With individual inpatient supply off, a pharmacist-first ward prescription is in the queue, has no supply decision, and leaves when a pharmacist has accepted its lines. A standard-lane ward prescription never appears.
- **S34** A nurse, a receptionist and staff of another hospital are refused at every action in this step.

**STOP 5.** Scenario results; the timing of S15; screenshots against artboards 1.1, 1.2, 1.3, 1.7, 1.8 and 1.10; axe; red-scarcity tests.

### Step 6: Hand-over and supply

Identity, labels, what was explained, payment status, `recordHandover`, Supplied today, the look-back list, reversal, correction, the inpatient setting.

Scenarios:

- **S35** A standard prescription of three lines, all on the shelf: recorded in the budgeted interactions. One transaction. Each batch is down by exactly its quantity; each supplied line names its batch and expiry.
- **S36** With the name alone, the server refuses the hand-over. A wrong date of birth is refused and logged. After five wrong tries the typed check closes for that hand-over. "Identified another way" with a note lets the hand-over through; it is listed for the pharmacy in charge and counted. No pharmacy screen or response carries the stored date of birth or phone number.
- **S37** Someone else collects: their name and relationship are stored.
- **S38** The first batch holds less than the quantity: the supply splits across two batches in expiry order. Two supply events, two movements, two labels.
- **S39** A batch that is not first to expire needs a reason.
- **S40** A part supply with the rest owed leaves the line under Open lines with both quantities. A later "Supply now" of part of it keeps the line owed with the new quantities; of the rest, closes it. A quantity above what is owed is refused.
- **S41** A part supply with the rest to buy outside prints the slip for the rest.
- **S42** Between "ready" and hand-over another user takes the batch down. The hand-over is refused with the batch's current figure, and nothing is written.
- **S43** Two dispensing points hand over the same line at the same moment, from different batches. Exactly one succeeds. The other is told where and when it was supplied.
- **S44** The prescriber changes a standard-lane line after its decision was staged. The hand-over is refused for that line with "Review it again", and nothing is written.
- **S45** A double tap writes one hand-over.
- **S46** A forged `recordHandover` for a prescription awaiting co-signature is refused.
- **S47** Labels print one per batch supplied, with the directions byte for byte and the batch and expiry. With "written by hand" the tick is recorded and nothing prints.
- **S48** A different pack of the same strength is supplied by a technician. A different strength is refused for a technician. A pharmacist supplies it with a reason and the pharmacist's line; the label and the record carry that line, marked; the prescriber is informed.
- **S49** A prescription with no structured quantity opens with the quantity empty and required. Nothing is pre-filled from the dose text.
- **S50** Where payment status is required, "Not recorded" is refused and "Emergency" passes with nothing further asked. A status set on the review screen shows in the queue.
- **S51** A supply is reversed the same day with the pack fit: the quantity is back in its batch. With the pack not fit: it is back and written off in the same step, and the shelf figure is unchanged. Either way the line returns to where it was before the hand-over, the prescriber sees it, and the original supply is still in the record. The next day "Reverse" is not offered.
- **S52** The in-charge marks a three-day-old supply "recorded in error". No stock moves; the record keeps the supply; the prescriber is told; the line is back where it stood, and can be supplied.
- **S53** Supplied today lists every hand-over; its count equals the day's hand-over records.
- **S54** With D-PH1-05's setting off, a technician cannot supply a pharmacist-first prescription. With it on (by fixture), the technician records a reason and supplies; the supply is on the look-back list until a pharmacist records a look-back. A controlled line is still refused.
- **S55** With individual inpatient supply on, a ward prescription is handed over to a named member of ward staff.
- **S56** Tablet and phone viewports: S35 at 834 px; the prescriber's answer (S16) one-handed at 390 px.

**STOP 6 (first merge).** Scenario results; the interaction count and server timing; a photograph or print of a label; screenshots against artboard 1.4. Everything to here can merge as one reviewable diff.

### Step 7: Controlled drugs

The supply screen, the witness, the committed count, the difference, the Controlled drugs page, witnessed stock actions.

Scenarios:

- **S57** A controlled supply without the count, without either paper attestation, or without a witness is refused on the server, each case separately.
- **S58** The supplier offered as their own witness is refused. A witness authenticated with the supplier's factor is refused.
- **S59** The witness signs in first. The count is typed and committed before MedSync's figure is shown; it cannot be retyped. It differs from the balance: both figures are recorded with supplier and witness; the pharmacy in charge sees the difference; the supply proceeds from the counted figure; that batch carries a witnessed correction.
- **S60** A prescription with a controlled line is never in the standard lane. The line is never offered "buys it outside", never prints on the slip, and never takes D-PH1-05's path.
- **S61** A medicine flagged controlled with no signed class shows "Controlled drug" with no class and takes the full path. A stocked medicine the pharmacist reviewer signed as controlled, which prescribing does not flag, also takes it.
- **S62** A witnessed receipt, a witnessed shift count and a witnessed transfer are recorded; each is refused without a witness. The page's running balance equals the ledger at every row.
- **S63** A pharmacy technician cannot supply a controlled line, and can witness one if the signed list says so.
- **S64** A prescription with one controlled line and one other is handed over once, in one transaction.
- **S65** A controlled prescription changed since it was printed shows the caution, and the first attestation is that the paper matches the screen.
- **S66** The register slip prints under its "this is not the register" heading. No screen in this step says the paper is no longer needed.

**STOP 7.** Scenario results; screenshots against artboard 1.5; a print of the register slip.

### Step 8: Downtime, the dispensing log and going live

Behind `pharmacyDowntime`, then the readiness page and the two switches.

Scenarios:

- **S67** Print 10 sheets: 10 numbers are reserved and each sheet carries one, with numbered rows. The page prints on A4, legible in greyscale.
- **S68** The in-charge records a downtime and the sheets used. A row is entered. The supply shows the sheet's time, "Entered after downtime" and the sheet and row. Stock moved at the sheet's time.
- **S69** The same row cannot be entered twice. "Sheet complete" closes the sheet. Unused sheets do not count as waiting.
- **S70** A supply against a paper prescription is entered. No prescription row was created.
- **S71** Back-entry takes a batch below zero. It is recorded; the medicine shows "Count needed".
- **S72** A time in the future is refused. A time outside every recorded downtime is refused until the in-charge records the period; a technician cannot record one.
- **S73** A patient who is not registered cannot be created from this screen.
- **S74** A row with no identity tick, a row for a pharmacist-first prescription with no pharmacist's initials, a row whose batch had expired, and a row for a line that already has a supply on record are each recorded and put on the look-back list with the reason. A row for a line that was still awaiting review is recorded too. A pharmacist records a look-back on each.
- **S75** A back-entered controlled supply is listed on the Controlled drugs page until it is confirmed against the register, with a witness.
- **S76** A "not supplied" row is entered as that outcome, with the sheet's time.
- **S77** A drill is recorded. It writes no patient record and moves no stock.
- **S78** The dispensing log prints the day's supplies in the confirmed column order, one row per batch supplied. Before confirmation it carries the "not yet confirmed" line. Its row count equals the day's supply events.
- **S79** A point with no drill recorded cannot be switched on, and the page says which condition is unmet.
- **S80** All six conditions met: admin A requests, admin A cannot approve their own request, admin B approves, the switch is audited. A second point is refused until a pilot note is on record. D-PH1-05's setting is refused without an answer to legal question 1 on record and a second approver.
- **S81** At a hospital with one live point and one that is not, the first works as Section 5 describes and the second shows the Phase 0 read-only view with the Stock page.
- **S82** A live point is switched off, with a reason and a second approver. It returns to read-only; its Open lines can still be confirmed and closed; a line at a stage in its queue is handled from the other live point.
- **S83** `pharmacyDispensing` and `pharmacyDowntime` off: behaviour matches the Phase 0 baseline.

**STOP 8 (second merge).** Scenario results; a print of the sheet and of the log; screenshots against artboard 1.9 and of the readiness page. From here a production point can meet the floor.

### Step 9: Beyond the floor, then hardening and documentation

Behind `pharmacyStockAnswer` and `pharmacyPatientList`: the prescriber's stock line, the ward chip, the patient's list and messages. If GATE A deferred these, skip to the hardening list and record the seams.

Scenarios:

- **S84** With a live point, the prescribing dialog shows on the shelf, low, not on the shelf, not stocked or not counted, each in its words. No quantity appears anywhere on the doctor's side.
- **S85** For a medicine that is out, the doctor chooses "Aware; prescribe anyway". The prescription is placed; the answer is stored; the pharmacy's review screen shows it.
- **S86** With no live point serving the patient, the dialog says "Pharmacy not linked yet", as in the baseline.
- **S87** A medicine with a batch below zero answers "not counted". A medicine that is both uncounted and at zero answers "not counted", by AV-3's order.
- **S88** `pharmacyStockAnswer` off: the dialog matches the baseline.
- **S89** The administration record shows "Pharmacy: not yet reviewed" on a new pharmacist-first inpatient medicine, and the first dose can be charted. After review the chip changes.
- **S90** After a hand-over the patient's list shows each supplied medicine once, with its directions as written and any pharmacist's line, marked. A refill date shows only where days covered were recorded. A reversal withdraws the entry.
- **S91** The patient taps "I have bought it": the line closes as reported by the patient. In a second run, "I could not get it": the line stays open, is marked in Open lines, and the prescriber is told; the pharmacy changes it to owed.
- **S92** `getRefillStatus` returns due and overdue from supply events alone.
- **S93** Every message template passes the banned-term scan. A fixture template that names a medicine fails the build; so does one that names a clinic or a dispensing point.
- **S94** With live SMS off nothing is sent and the pharmacy's list says so. With it on and an approved template, one message goes per event, to the patient's own number. "Tell the patient it is here" appears on an owed line only while the medicine is on the shelf and a message can be sent; the "in stock today" message goes only when a person presses it.
- **S95** A medicine in a restricted class produces the same message text as any other.
- **S96** In production, `pharmacyPatientList` is refused while a patient-facing string is `draft` or the hospital has no signed message name.

Then, always: the timed trials of the hand-over and back-entry budgets with two or three pharmacy staff if available; reduced motion; the performance budgets; the user guide (one page each for pharmacist, pharmacy technician, prescriber, pharmacy in charge, hospital admin); the hazard log, completed; the ADRs; the final report.

**STOP 9 (final, third merge).** The table in Section 13, filled in.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44×44 px on touch.
- Lane, stage, Open-lines and look-back tabs are `tablist`s with counts in their accessible names.
- Each line's decision is a radio group with the medicine in its legend. The quantity field's accessible name includes the medicine and the issue unit ("{medicine}, quantity in {issue unit}").
- Every stage and state is a word. Amber chips carry an icon and a word. Colour is never the only signal.
- Struck-through text is also announced: a replaced or reversed line reads "Replaced:" or "Reversed:" before its content.
- The query form, the not-on-the-shelf panel and the witness section are regions with headings; focus moves into each when it opens and returns to the control that opened it.
- A new query on the doctor's side is announced once, politely. It is not an alarm: no assertive region, no sound, no flashing.
- The identity section never exposes the stored second identifier to assistive technology.
- Reduced motion: no row animation.
- Colour: teal for actions and focus; plum (or the pharmacy hue's tint) for the active navigation item only; amber for caution; no red; no green; no left-edge bars.
- Paper: body text at least 12 px, rules at least 1 px, nothing that needs colour to read. Labels are legible at the size the dispensing point prints.

## 11. Performance budgets

| Measure                                               | Budget                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| Queue TTFB with 500 prescriptions in scope            | p95 < 400 ms                                        |
| Lane, stage or point switch                           | p95 < 100 ms, no refetch                            |
| Review screen TTFB for 8 lines                        | p95 < 400 ms, a fixed number of round trips         |
| `recordHandover`, 3 lines (server)                    | p95 < 500 ms                                        |
| `getAvailability` inside the prescribing dialog       | p95 < 150 ms for 5 medicines, one round trip        |
| Query visible to an online prescriber                 | p95 ≤ 5 s realtime, ≤ 15 s polling                  |
| Stock page TTFB with 1,000 products                   | p95 < 500 ms                                        |
| Added JS on `/pharmacy` and on the doctor's plan step | report both; flag anything above 40 KB gzipped each |

## 12. Security, privacy, audit

- AAL2 on every route here. Hospital and dispensing-point scope on every read and write. Reception and lab staff blocked in the app and in the database.
- Every review, query, answer, outcome, hand-over, supply, reversal, stock movement, count, controlled entry, print, signature, briefing and switch is audited with the actor, time, hospital and point.
- The event tables are append-only by trigger.
- The second-identifier check runs on the server and logs each attempt; after five wrong attempts on one hand-over the typed check closes for it (SU-4). No pharmacy read returns a stored date of birth or phone number.
- Realtime payloads, SMS, logs, analytics, file names and URLs carry no PHI. A verification code identifies no patient.
- The prescriber's side never receives a stock quantity. The patient's side never receives a staff name.
- Data Protection and Privacy Act 2019: the supply record holds the minimum needed to show what was supplied and to recall a batch. Patient messages name no medicine. Record the basis in the ADR.
- Stock is money. A count, an adjustment and a reversal are each visible to the pharmacy in charge with who did it; a count is blind; a controlled movement is witnessed.
- If the server client still reads a legacy `service_role` key, flag it.
- The governance gap stays documented: Fadhul holds superadmin, CSO and audit-reviewer roles at once. Signing as CSO and approving a switch as the second approver must be two different people wherever a second person exists (D-PH1-36).

---

## 13. Numbers to report at the final STOP

| Metric                                                                                               | Baseline | Target           | Result |
| ---------------------------------------------------------------------------------------------------- | -------- | ---------------- | ------ |
| Lines that left the queue without an outcome event                                                   | all      | 0                |        |
| Open outcomes closed by anything but a person's or a prescriber's action                             | none     | 0                |        |
| Line moves outside LO-4's table                                                                      | none     | 0                |        |
| Lines supplied twice, or supplied on a version the prescriber had changed                            | none     | 0                |        |
| Supplied lines without a product, batch and expiry                                                   | all      | 0                |        |
| Supplies without a movement, or "supplied" movements without a supply                                | none     | 0                |        |
| Projected balances that differ from their ledger                                                     | none     | 0                |        |
| Batches below zero with no downtime entry behind them                                                | none     | 0                |        |
| Live hand-overs with neither two identifiers nor a recorded "identified another way"                 | none     | 0                |        |
| Hand-overs recorded as "identified another way"                                                      | none     | report the count |        |
| Pharmacy responses that carry a stored date of birth or phone number                                 | none     | 0                |        |
| Expired batches supplied live                                                                        | none     | 0                |        |
| Prescription rows written by a pharmacy action                                                       | none     | 0                |        |
| Directions shown or printed differently from how they are stored                                     | none     | 0                |        |
| Live pharmacist-first supplies with neither a pharmacist's acceptance nor a recorded D-PH1-05 reason | none     | 0                |        |
| Supplies on the look-back list with no look-back after 7 days                                        | none     | report the count |        |
| Controlled supplies without a committed count, both attestations and a separate witness              | none     | 0                |        |
| Screens that say or imply MedSync replaces the statutory paper                                       | none     | 0                |        |
| Screens that say or imply the prescriber knows before an answer                                      | none     | 0                |        |
| Screens, prints or audit lines that call a pharmacy technician a pharmacist                          | none     | 0                |        |
| Stock quantities readable on the prescriber's side                                                   | none     | 0                |        |
| Clinical numbers, medicine lists or prices in code, seeds or copy                                    | none     | 0                |        |
| Unsigned content that acted                                                                          | none     | 0                |        |
| Templates failing the banned-term scan                                                               | none     | 0                |        |
| Interactions for a standard three-line hand-over                                                     | none     | ≤ 8              |        |
| `recordHandover` p95                                                                                 | none     | < 500 ms         |        |
| Query → visible to the prescriber, p95                                                               | none     | ≤ 5 s / ≤ 15 s   |        |
| Back-entry of one sheet row, median                                                                  | none     | ≤ 30 s           |        |
| Rows on the printed dispensing log against supply events                                             | none     | equal            |        |
| Hazards without a control and a test                                                                 | none     | 0                |        |
| Rule IDs without a test                                                                              | none     | 0                |        |
| RLS probes passed                                                                                    | none     | 100 %            |        |
| axe serious or critical                                                                              | S0       | 0                |        |
| Red on routes added by this slice                                                                    | none     | 0                |        |
| Phase 0 and lab tests changed or failing                                                             | none     | 0                |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #        | Decision                                                                    | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-PH1-01 | Which prescriptions must end in an outcome                                  | Every window prescription (outpatient and discharge) written since the hospital's first point went live. This is floor condition 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-PH1-02 | Inpatient prescriptions (roadmap D-PH-05)                                   | With the setting off, pharmacist-first ward prescriptions are reviewed and can be queried; standard-lane ones are not listed; no ward supply is recorded. A hospital that supplies inpatients one by one switches individual inpatient supply on. Ward stock is Phase 2. The pilot site's practice decides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-PH1-03 | The permission map, version 2 (CSO, legal)                                  | Appendix A and the permission column of Section 8. It cannot be signed until legal question 1 has a written answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-PH1-04 | The lane reasons (CSO, pharmacist reviewer)                                 | Switch each on per hospital with Step 0's counts in hand. On: overridden stop, controlled drug, the child check, the renal check, the signed high-risk list, a changed pre-set dose. **Off for now: "typed dose with no signed reference"**, which today would catch nearly every prescription. Turn it on as signed doses grow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-PH1-05 | A pharmacist-first prescription when no pharmacist is on duty               | A hospital setting, off by default, that the server lets on only with an answer to legal question 1 on record and a second approver. When on, a holder of `pharmacy.dispense` may supply with a reason from a signed list, and the supply waits on the look-back list for a pharmacist. Never for a controlled drug. With it off, the prescription waits for a pharmacist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-PH1-06 | The standard lane                                                           | No pharmacist review is recorded. The person supplying checks the lines, and the record says "standard lane, checked at supply" wherever a reviewer would be named                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-PH1-07 | Query codes and the prescriber's answer reasons                             | The pack in Appendix D. Short lists; "Other" always carries text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-PH1-08 | Who may answer a query                                                      | Any clinician who may prescribe for that patient at the hospital. The first answer wins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-PH1-09 | Phone answers                                                               | A logged "keep" from a clinician who may prescribe answers the query, names them, and can be disputed. A phone "change" or "stop" changes nothing until the prescriber acts in MedSync                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D-PH1-10 | Declining to supply                                                         | A pharmacist may decline a line only after a query on it. The prescriber is told and the patient's list says so. It is a recorded outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-PH1-11 | Outcome, close, reversal and adjustment reasons                             | The packs in Appendix D                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-PH1-12 | A prescription nobody collects                                              | It stays listed until a person closes it as not collected. Nothing closes by itself in this slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D-PH1-13 | The slip to fill elsewhere (legal)                                          | A not-supplied slip that goes with the patient's signed prescription. Its wording is confirmed with the lawyer (Appendix E, question 5). The alternative is a slip the prescriber signs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-PH1-14 | Substitution (roadmap D-PH-06) (CSO, pharmacist reviewer)                   | A different pack of the same strength: anyone who may dispense. A different strength: a pharmacist, with a reason and their own typed line, printed on the label as theirs; the prescriber informed. Anything else returns to the prescriber. The cautious alternative is no strength change in this slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-PH1-15 | Quantity when the prescription carries none                                 | The dispenser types the quantity supplied. Add a structured quantity or duration to prescribing in its own slice; this prompt does not change prescribing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-PH1-16 | Identity at hand-over (CSO)                                                 | The full name said by the person, and the date of birth or phone number typed and compared on the server. The MedSync number does not count: it is on the screen and on the paper. Where neither can be given, the supplier records how the person was identified; each such hand-over is listed for the pharmacy in charge and counted. Nobody is turned away for lacking a document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D-PH1-17 | Labels (CSO, pharmacist reviewer)                                           | Label mode per dispensing point: printed, or written by hand and attested. One label per batch supplied. The fields in Appendix D's pack, with batch and expiry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-PH1-18 | Directions in plain words                                                   | None ship. Labels print the directions as written until plain-words templates are signed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D-PH1-19 | Counselling points and languages                                            | The pack in Appendix D. Recorded as ticked; never required to hand over                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-PH1-20 | Payment status (roadmap D-PH-11)                                            | Recorded on the review screen or at hand-over. Required only where the hospital says so. Never verified by MedSync. Emergency is never held                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D-PH1-21 | Price                                                                       | Optional on the product, stored on the supply as it was. Nothing is added up                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-PH1-22 | The level of each stock state in the prescribing dialog (CSO)               | Note for on the shelf, low and not counted. Check for not on the shelf and not stocked, with one tap to continue. Never a Stop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-PH1-23 | Reorder levels and count freshness                                          | Set by the pharmacy in charge per medicine and point. Operational figures, not clinical ones. With none set, a medicine is never "low" and a count never goes stale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D-PH1-24 | Counts                                                                      | Blind: the counter is not shown the expected figure. For a controlled drug the count is committed before the figure is shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-PH1-25 | Reversing a supply, and correcting the record                               | Reversal the same day, by a pharmacist or the in-charge, with a coded reason; witnessed for a controlled drug. Later, the in-charge marks a supply "recorded in error", which moves no stock                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-PH1-26 | Controlled drugs (roadmap D-PH-08) (CSO, legal)                             | MedSync records the supply, the count, the witness and two attestations, and prints a slip. The signed prescription and the statutory books stay on paper. A difference is recorded and the supply proceeds from the counted figure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D-PH1-27 | Who may witness                                                             | Any holder of `pharmacy.dispense` at the hospital, never the actor. Widen to nurses or doctors only if the hospital's own procedure allows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-PH1-28 | Controlled classes                                                          | The pharmacist reviewer signs a decision for every stocked medicine from the Act's schedules, "not controlled" included. Unsigned: the full path applies and no class is named                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-PH1-29 | The high-risk list                                                          | Per hospital, signed. None is proposed here. With none signed, that lane reason does not fire and the lane explainer says the hospital has no high-risk list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-PH1-30 | The refill date                                                             | Shown only when the dispenser recorded the days covered, or a structured duration was supplied in full. Never estimated from text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D-PH1-31 | Patient wording and messages (CSO, pharmacist reviewer) (roadmap D-PH-15)   | Appendix B. No medicine, condition, clinic, dispensing point or prescriber in any message. SMS off by default. Nothing tells a patient that a medicine is being held for them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D-PH1-32 | What a patient's tap does                                                   | "I have bought it" closes the line as reported by the patient. "I could not get it" keeps it open and tells the pharmacy and the prescriber                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D-PH1-33 | The review state on the administration record (roadmap D-PH-01)             | A read-only chip. It never holds a dose. If the record cannot mount it on this branch, record the seam                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D-PH1-34 | Downtime                                                                    | Any holder of `pharmacy.dispense` enters sheets. Only the in-charge records a downtime period. Entry refuses nothing that has already been handed over; it flags it for a pharmacist's look-back. A paper prescription is its own record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D-PH1-35 | Going live, and the order of rollout                                        | Six conditions and a second approver, per dispensing point. Order: stock set-up and `pharmacyDowntime`, the drill, the switch at one point, then `pharmacyStockAnswer`, then `pharmacyPatientList`. A second point needs its own conditions and a note on the pilot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D-PH1-36 | Who signs what, and one person in several roles                             | Clinical sets (the lane rule, the high-risk list, controlled classes, the substitution rule, labels, counselling points, query codes): the pharmacist reviewer and the CSO. Operational reason lists (outcome, close, reversal, adjustment, batch choice, supply without a pharmacist, payment exemption, identity routes): the pharmacy in charge and the CSO. Staff-facing copy: the CSO. Patient-facing copy and the hospital's message name: the CSO and the pharmacist reviewer. SMS templates: two different users, after the copy is signed. Operational settings (reorder levels, count freshness, the expiry look-ahead, the log's columns): the pharmacy in charge alone. Each signature needs a fresh second factor. Where a second eligible person exists, the author of a change is not its only signer and the CSO is not also the second approver of a switch. Where none exists, record the exception in words on the signature |
| D-PH1-37 | The prescriber's name and council number on the slip (CSO, data protection) | Print them on the slip, as they are on the signed prescription. This widens Phase 0's read list for this one print; pharmacy screens still show the cadre only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-PH1-38 | Prescriptions written before go-live                                        | Out of scope until a person brings one into the queue. Nothing from before go-live is closed in bulk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D-PH1-39 | The name a hospital uses in messages                                        | Each hospital sets a neutral message name, signed, so that the hospital's own name never reveals a condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-PH1-40 | Step 9                                                                      | Build it after the floor. It may be deferred without touching Steps 0 to 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E-PH1-01 | Where pharmacy records live                                                 | As append-only events beside the prescription. Stages and outcomes are projections                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E-PH1-02 | Stock                                                                       | An append-only ledger with the balance as a projection (roadmap E-PH-02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| E-PH1-03 | Holding stock for a "ready" or an owed line                                 | None. Lines and batches are re-checked under a lock at hand-over, and no patient is told a medicine is held                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E-PH1-04 | The supply record                                                           | It names its dispensing point and supplying organisation, and assumes neither is the prescribing hospital (roadmap E-PH-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E-PH1-05 | Quantities                                                                  | Whole issue units. No conversion between units, packs or strengths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E-PH1-06 | Queries                                                                     | A small event model of their own, delivered through the channel already on the branch, with a polling fallback. No second notifications engine and no automatic escalation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E-PH1-07 | Signed content                                                              | Through the signed-reference mechanism if it holds per-hospital, versioned, two-signature sets. Otherwise dedicated tables of the same shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E-PH1-08 | Downtime                                                                    | One workspace-neutral module shared with the lab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E-PH1-09 | Print                                                                       | CSS only. No label-printer integration and no PDF dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E-PH1-10 | Paper prescriptions                                                         | Their own record. Never rows in the prescriptions table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| E-PH1-11 | Waiting time                                                                | Shown in minutes with no colour and no target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E-PH1-12 | Numbers                                                                     | A block of 25 migrations and 20 ADRs claimed at Step 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| E-PH1-13 | Delivery                                                                    | Three merges on the one roadmap phase: Steps 0 to 6, Steps 7 and 8, Step 9. One go-live, after the second                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 15. Out of scope (leave clean seams)

**Roadmap Phase 2.** The main store · receiving against a delivery note with discrepancies · ward stock and requisitions · drawing ward doses from stock · emergency cart reconciliation · ordering and quantification · the bimonthly order and monthly stock status outputs · the tracer-medicine audit · the reconciliation report in quantity and money · expiry alerts by location · batch recall · scanning. This slice leaves them: the ledger and its movement kinds, stock-out projections, the supply-to-batch link, prices as snapshots, and transfer movements.

**Roadmap Phase 3 and 4.** Interaction checks · reconciliation at discharge · stewardship · reaction reports · refill requests and reminders · partner pharmacies · the e-pharmacy. This slice leaves them: coded queries, the location-neutral supply record, `getRefillStatus`, the verification code.

**Not here at all.** Any change to how a prescription is written, co-signed, changed or printed · adding quantity or duration to prescribing · suggested alternatives in the prescribing dialog · billing, invoices, receipts, cashiering or insurance claims · compounding, sterile preparation and cytotoxics · a waiting-time target · automatic escalation of queries · the mobile (Expo) app and push · an offline mode · holding stock for a patient · label-printer or barcode integration · any link to the NMS portal or RxSolution · unit or strength conversion of any kind.

## 16. ADRs (numbers from the ledger)

- Pharmacy records as events beside the prescription; "the pharmacy never changes a prescription".
- Line stages and outcomes; what may close a line; nothing closes by itself.
- Review lanes: signed reasons, the fail-safe with no signed rule, and the standard lane's record.
- Queries to the prescriber: "sent, seen, answered"; phone answers and dispute; no escalation.
- The stock ledger: movements, batches, balance as a projection, blind counts.
- One action, two records: the hand-over transaction, first expiry first out, no reservation.
- Identity at hand-over.
- Substitution, and "no conversion".
- Controlled drugs: the witnessed record beside the statutory paper.
- The availability seam's real answer, and why the prescriber sees no quantity.
- The patient's medicine list from supplies, the refill date rule, and messages that name no medicine.
- Downtime: one shared module, back-entry with true times, paper prescriptions as their own record.
- Going live per dispensing point: six conditions and two people.
- The location-neutral supply record.
- Payment status and price as recorded facts with no billing.
- The look-back list: what downtime entry and the "no pharmacist on duty" exception leave for a pharmacist.
- What is in scope on the day a point goes live, and what happens when a point is switched off.
- Three merges and one go-live.

## 17. Definition of Done

- [ ] R1 to R18 resolved or recorded. The Phase 0 baseline holds with the flags off.
- [ ] Every window line in scope ends in an outcome. Open lines close only through a person's or a prescriber's action. No line makes a move outside LO-4's table.
- [ ] No line is supplied twice, and none on a version the prescriber changed.
- [ ] Every supplied line names a product, a batch and an expiry. A supply and its movement always exist together. Every balance equals its ledger.
- [ ] No live hand-over is recorded without two identifiers, or a recorded "identified another way" that the pharmacy in charge can see. No pharmacy screen carries a stored date of birth or phone number.
- [ ] No pharmacy action writes to a prescription. Directions display and print as stored. Nothing is converted.
- [ ] A live pharmacist-first supply always has a pharmacist's acceptance, or a recorded reason under D-PH1-05 and a place on the look-back list.
- [ ] A controlled supply always has its committed count, its two attestations and a separate witness. No screen says the paper is replaced.
- [ ] A not-supplied outcome reaches the prescriber, and the supplier is told to tell the patient. No patient is told a medicine is held for them.
- [ ] No screen, print or audit line calls a pharmacy technician a pharmacist.
- [ ] No clinical number, medicine list or price exists in code, seeds or copy. No unsigned content has acted.
- [ ] A downtime sheet can be printed, entered with its true times and seen as entered afterwards. What a live supply would have refused is on the look-back list. A drill is recorded.
- [ ] A dispensing point can be switched on only with six conditions and two people, and switched off without stranding an open line.
- [ ] Every rule ID has a test. RLS probes pass; client writes are denied; the event tables are append-only.
- [ ] axe is clean. Red-scarcity tests pass on every new route. Reduced motion is honoured.
- [ ] S1 to S83 pass. Phase 0's and the lab's tests are unchanged and passing.
- [ ] **If Step 9 was built:** the prescriber sees a real stock answer, with no quantity, that never blocks, and with no live point the answer is unchanged; the patient's list shows what was supplied; no message names a medicine, a clinic or a dispensing point; templates pass the scan; S84 to S96 pass. **If it was deferred:** the seams are recorded and `recordHandover` writes no list entry.
- [ ] The hazard log is complete and signed by the CSO and the pharmacist reviewer. The user guide exists. ADRs written. The final report has its numbers. Each of the three diffs on `feat/pharmacy-dispensing` is reviewable.

---

## Appendix A: Proposed permission map, version 2 (for signature at GATE A; not signable before the legal answer)

The permission each action needs is the last column of Section 8's table; this map says who holds each permission.

| Who                                                           | view                                          | review                                                        | dispense                                                                                                                                                                   | stock    | controlled      | manage                                                                             |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------- | ---------------------------------------------------------------------------------- |
| Pharmacist                                                    | yes                                           | yes                                                           | yes                                                                                                                                                                        | yes      | yes             | only by hub assignment                                                             |
| Pharmacy technician                                           | yes                                           | no                                                            | yes: standard-lane prescriptions; pharmacist-first lines a pharmacist has accepted; and, only where D-PH1-05 is on, a pharmacist-first prescription with a recorded reason | yes      | no; may witness | only by hub assignment, and only if the legal answer allows a technician in charge |
| Head of Pharmacy, dispensing-point in-charge (hub assignment) | by cadre                                      | by cadre                                                      | by cadre                                                                                                                                                                   | by cadre | by cadre        | yes, while assigned                                                                |
| Doctor, clinical officer                                      | no                                            | no; answers queries with the prescribing permission they hold | no                                                                                                                                                                         | no       | no              | no                                                                                 |
| Nurse, midwife                                                | no; reads the review state of inpatient lines | no                                                            | no; may be the named collector where D-PH1-02 is on                                                                                                                        | no       | no              | no                                                                                 |
| Lab staff, reception                                          | no                                            | no                                                            | no                                                                                                                                                                         | no       | no              | no                                                                                 |
| Hospital admin                                                | no                                            | no                                                            | no                                                                                                                                                                         | no       | no              | no; holds the go-live page and the pharmacy settings, with no PHI                  |
| Superadmin                                                    | no, without break-glass                       | no                                                            | no                                                                                                                                                                         | no       | no              | no                                                                                 |

Any other pharmacy cadre found in the catalogue, pharmacy interns included, gets no row until Fadhul adds one (roadmap D-PH-10).

## Appendix B: Copy to be signed (all `draft`; D-PH1-36 says who signs which rows)

| Key                               | Text                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice, review screen             | MedSync does not check drug interactions at this hospital, and {n} of these {N} doses {has/have} a signed reference. Check each line yourself.                               |
| Notice, queue                     | MedSync does not check drug interactions at this hospital, and {signed} of the {total} medicines on its list have a signed dose reference. Check each prescription yourself. |
| No lane rule                      | This hospital has not signed its review rule, so every prescription needs a pharmacist.                                                                                      |
| Lane explainer                    | A prescription goes to "Pharmacist first" when {reasons that are on}. Everything else is "Standard". The list of reasons is signed by the Clinical Safety Officer.           |
| No high-risk list                 | This hospital has no signed high-risk list, so that reason is not used.                                                                                                      |
| Waiting for a pharmacist          | Waiting for a pharmacist                                                                                                                                                     |
| Awaiting co-sign                  | Cannot be supplied yet. A senior has not signed this prescription.                                                                                                           |
| Changed since printing            | Changed since printing. The paper the patient carries is out of date.                                                                                                        |
| Queue footer                      | {n} of {N} at {point}, {lane}. Waiting starts when the prescription was written. A prescription leaves the queue only with a recorded outcome for every line.                |
| Earlier, still open               | Written before today, still without an outcome                                                                                                                               |
| Before go-live                    | Written before this pharmacy began recording in MedSync.                                                                                                                     |
| Ward prescriptions                | Ward doses come from ward stock, which MedSync does not count yet.                                                                                                           |
| Controlled, before Step 7         | Supply this on paper as you do today. MedSync does not record controlled supplies yet.                                                                                       |
| Substitution note                 | A pharmacist may change the pack or strength only when the dose and the form the patient takes stay the same. Any other change goes back to the prescriber.                  |
| Pharmacist's line, label          | From the pharmacist: {line}                                                                                                                                                  |
| No product                        | No product is set up for this medicine at {point}.                                                                                                                           |
| Not counted                       | Not counted yet.                                                                                                                                                             |
| Expired batch                     | Expired {date}. Remove it from the shelf.                                                                                                                                    |
| Batch changed under you           | Batch {number} now holds {n}. Choose again.                                                                                                                                  |
| Already supplied                  | {Medicine} was already supplied at {point}, {time}.                                                                                                                          |
| Changed by the prescriber         | {Medicine} was changed by the prescriber at {time}. Review it again.                                                                                                         |
| Query sent                        | Query sent {time} · not answered                                                                                                                                             |
| Query not delivered               | The prescriber has NOT been told. Call them and log the call.                                                                                                                |
| Nobody to tell                    | Nobody can be told in MedSync. Call the ward or clinic.                                                                                                                      |
| Phone answer, to the clinician    | The pharmacy recorded your phone answer at {time}. Not you? Tell us.                                                                                                         |
| Query, on the problem card        | From the pharmacy ({cadre}), {time} · {type}. "{proposal}"                                                                                                                   |
| Not supplied, on the problem card | From the pharmacy, {time}. {Medicine} was not supplied: {reason}. {What the patient was told}.                                                                               |
| Not-supplied footer               | A line that is not supplied always carries a reason and a next step. It never closes on its own.                                                                             |
| Tell the patient                  | Tell the patient now.                                                                                                                                                        |
| No message sent                   | No message is sent. The patient knows only what you tell them.                                                                                                               |
| Slip, title                       | Medicine not supplied: to fill at another pharmacy                                                                                                                           |
| Slip, body                        | This medicine was not available at the hospital pharmacy today. Give this to the pharmacy together with your signed prescription.                                            |
| Slip, no quantity                 | Quantity: as on the prescription                                                                                                                                             |
| Slip, changed                     | The prescription was changed on {date}. Ask the hospital for a new copy.                                                                                                     |
| Slip, generic names               | Written by generic name.                                                                                                                                                     |
| Slip, verification                | To check this is real, call the hospital pharmacy on {phone} and give this code: {code}.                                                                                     |
| Slip, footer                      | Controlled drugs are never printed on this form. Printed {time} at {point}. Copy {n} of {N}.                                                                                 |
| Identity rule                     | Two identifiers are needed before the hand-over can be recorded. Ask the person to say them; do not read them out.                                                           |
| Identity mismatch                 | This does not match. Check you have the right patient.                                                                                                                       |
| Identified another way            | The card or prescription with the patient's number was shown · Known to staff · Other                                                                                        |
| Label, warning line               | Keep out of the reach of children.                                                                                                                                           |
| Label by hand                     | I have written the label on each envelope.                                                                                                                                   |
| Supplied without a pharmacist     | Supplied without a pharmacist: {reason}. A pharmacist will look at this supply.                                                                                              |
| Look-back tab                     | Look-back · {n} waiting                                                                                                                                                      |
| Reversed                          | Reversed {time} by {cadre}: {reason}                                                                                                                                         |
| Recorded in error                 | Recorded in error. {reason}                                                                                                                                                  |
| Controlled notice                 | MedSync's record does not replace the paper. Keep the signed prescription and make the entry in the hospital's controlled drugs register, as you do today.                   |
| Controlled, paper 1               | The signed prescription is here, matches what is on this screen, and will be kept.                                                                                           |
| Controlled, paper 2               | The entry is made in the controlled drugs register, and the person collecting has signed it.                                                                                 |
| Controlled, witness               | I, the witness, saw the count and agree with the balance of {n}.                                                                                                             |
| Controlled, difference            | The count does not match the record. Record the difference; it goes to the pharmacy in charge.                                                                               |
| Register slip heading             | Copy for the controlled drugs register. This is not the register.                                                                                                            |
| No buying outside                 | A controlled drug cannot be sent to another pharmacy on this form. Return it to the prescriber, or record it as owed.                                                        |
| Stock line, in stock              | On the shelf at {point}. {Counted {when}. / Received {when}, not yet counted.}                                                                                               |
| Stock line, low                   | Low at {point}. Counted {when}.                                                                                                                                              |
| Stock line, out                   | Not on the shelf at {point}{ since {date}}. {In stock at {other point}.}                                                                                                     |
| Stock line, not stocked           | Not stocked at {point}.                                                                                                                                                      |
| Stock line, not counted           | Stock at {point} has not been counted {since {date} / yet}. This answer may be wrong.                                                                                        |
| Stock line, footer                | Stock informs and never blocks. A dispensing point that has not counted says so.                                                                                             |
| Ward chip                         | Pharmacy: not yet reviewed · Pharmacy: reviewed {time} · Pharmacy: query with the prescriber · Pharmacy: standard lane, not reviewed                                         |
| Patient, not given                | Not given today                                                                                                                                                              |
| Patient, buying outside           | The hospital pharmacy had none. Take the paper you were given, with your prescription, to any licensed pharmacy.                                                             |
| Patient, owed                     | The hospital pharmacy had none today. Ask at the pharmacy, or call {phone}, to find out when it has arrived.                                                                 |
| Patient, declined                 | The pharmacy did not give this medicine. Speak to your doctor or the pharmacy.                                                                                               |
| Patient, refill                   | Next supply due around {date}                                                                                                                                                |
| In-app or push, not available     | One of your medicines was not available at the hospital today. Open MedSync to see what to do.                                                                               |
| SMS, owed                         | MedSync: one of your medicines was not available at {hospital message name} today. Call the pharmacy on {phone} to ask when it has arrived.                                  |
| SMS, buying outside               | MedSync: one of your medicines was not available at {hospital message name} today. Keep the paper you were given, or call the pharmacy on {phone}.                           |
| In-app, push or SMS, in stock     | A medicine the pharmacy owed you is in stock at {hospital message name} today.                                                                                               |
| Message rule                      | No message names a medicine or a condition. Those appear only after sign-in.                                                                                                 |
| SMS off                           | SMS is off at this hospital.                                                                                                                                                 |
| Downtime tag                      | Entered after downtime · Supplied {time} · entered {time} · sheet {number}                                                                                                   |
| Downtime, no period               | Ask the pharmacy in charge to record this downtime first.                                                                                                                    |
| Transcribed                       | Transcribed from a paper prescription by {cadre}                                                                                                                             |
| Count needed                      | Count needed                                                                                                                                                                 |
| Not registered                    | Register this patient at reception first.                                                                                                                                    |
| Log columns                       | Columns not yet confirmed against this hospital's dispensing log.                                                                                                            |
| Sheet footer                      | Write each time as it happened. MedSync keeps that time and marks the record "Entered after downtime". Controlled drugs also go in the register as usual.                    |

## Appendix C: Hazard log seed (complete each at Step 1; close each with a test)

For each: cause, effect, control built, the test that proves the control, residual risk.

1. A medicine is handed to the wrong patient.
2. The wrong medicine, strength or form is supplied for a line.
3. An expired batch is supplied.
4. A supply is recorded and no stock leaves the ledger, or stock leaves with no supply.
5. Two people supply the last units of one batch at the same moment.
6. One line is supplied twice: at two points, or once on screen and once from a downtime sheet.
7. A high-risk prescription is supplied with no pharmacist having seen it.
8. The lane rule is unsigned, mis-set or too wide, and the pharmacist-first lane is ignored or stops the window.
9. "Supply without a pharmacist" becomes the normal way of working.
10. A pharmacist's query never reaches the prescriber, and the pharmacy believes it did.
11. A prescriber changes a line after it was reviewed or staged, and the old version is supplied.
12. A prescription awaiting co-signature is supplied.
13. A line that was not supplied or was declined drops out of sight, and the patient goes without.
14. A patient sent to buy outside cannot get the medicine, and nobody learns of it.
15. A patient is told a medicine is waiting for them, and it is not.
16. The slip is used to obtain medicines it should not: altered, copied or presented alone.
17. A substitution changes the dose the patient takes, or the label carries directions for a different strength.
18. Directions on a label differ from what the prescriber wrote.
19. A dispenser types a quantity that does not match the course intended, because the prescription carries no quantity.
20. A refill date is wrong, and a patient on long-term treatment runs out or is chased for nothing.
21. The prescriber is told a medicine is on the shelf when it is not, or the reverse.
22. A prescriber stops prescribing a needed medicine because the screen said it was out.
23. A controlled drug is supplied without a witness, or with a witness who did not look.
24. A controlled drug is not treated as controlled, because prescribing did not flag it.
25. The controlled-drug record and the statutory register disagree.
26. Staff stop keeping the statutory paper because MedSync has a record.
27. A stock count is falsified, or an adjustment hides a loss.
28. A message reveals a patient's medicine or condition, through its text or through the name of a hospital, clinic or dispensing point.
29. The identity check is passed by reading from the screen, or "identified another way" becomes routine.
30. A supply is reversed or corrected and the patient's list still shows the medicine, or the reverse.
31. A supply recorded against the wrong patient is found days later and cannot be put right.
32. A downtime sheet is never entered, or is entered twice.
33. A back-entered supply carries the entry time as the supply time.
34. A medicine is supplied during downtime with no identity check, no pharmacist or no witness, and nobody looks afterwards.
35. A medicine is supplied during downtime against a paper prescription that MedSync never sees.
36. A pharmacy technician is shown, recorded or printed as a pharmacist.
37. One person signs the content, approves the switch and reviews the audit.
38. A hospital switches a point on before its stock is counted, and every stock answer is wrong on day one.
39. On the day a point goes live, the queue fills with old prescriptions and real ones are lost among them.
40. A point is switched off and its open lines are stranded.
41. A known interaction is missed because staff assume MedSync checks (open: the notice is the only control in this slice).
42. The inpatient's first dose is delayed waiting for pharmacy review.
43. A patient with no date of birth and no phone on file is turned away.

## Appendix D: Sign-off packs (templates only; propose no clinical values)

D-PH1-36 says who signs each pack. Reasons, codes and wording may be drafted for them; medicines, classes and levels may not.

**What happens while a pack is unsigned**

| Pack                                                                                         | While unsigned                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| The lane rule                                                                                | Every prescription is pharmacist-first, and the queue says so                                                                                       |
| The high-risk list                                                                           | That lane reason does not fire, and the lane explainer says there is no list                                                                        |
| Controlled classes                                                                           | A medicine prescribing flags takes the full controlled path with no class named. A point cannot go live until every stocked medicine has a decision |
| The substitution rule                                                                        | No strength change is offered                                                                                                                       |
| Plain-words templates                                                                        | Labels print the directions as written                                                                                                              |
| Reason and code lists, label fields, counselling points, the witness list, staff-facing copy | A point cannot go live (RD-1)                                                                                                                       |
| Patient-facing copy, templates, the message name                                             | The patient's list and live SMS cannot be switched on (RD-4)                                                                                        |
| The availability mapping                                                                     | The stock line cannot be switched on                                                                                                                |

**Lane reasons, per hospital.** Columns: reason · the stored fact it reads · share of last 30 days' prescriptions it catches (from Q7) · on or off · note. Proposed rows: a stop the prescriber overrode · a controlled drug (always on) · the child check fired (named as the prescribing dialog names it; Step 0 confirms the name and what it tests) · the renal check fired · a medicine on the signed high-risk list · a pre-set dose the prescriber changed · a typed dose with no signed reference.

**The high-risk list, per hospital.** Columns: medicine · why it is on the list · source · CSO decision. Sources to consult: the hospital's Medicine and Therapeutics Committee; the Uganda Clinical Guidelines 2023; the ISMP list of high-alert medications in acute care settings; WHO's _Medication Without Harm_ material on high-risk situations. No medicine is named in this prompt.

**Controlled classes, per stocked medicine.** Columns: medicine · controlled or not · class and group · the schedule and entry it comes from · what the class calls for at supply · signed. Source: the schedules to the National Drug Policy and Authority Act, read from the Act itself, and the narcotics statute in force (Appendix E, question 4).

**The witness list.** Which permissions may witness a controlled action (D-PH1-27).

**Outcome and close reasons.** Not supplied: out of stock at this dispensing point · out of stock in the hospital · expired or damaged stock only · not stocked at this hospital · other. Closed: not collected · the patient declined · filled elsewhere · other. Declined by the pharmacist: a short coded list for signature.

**Reversal, correction and stock reasons.** Reversal: handed back at the window · recorded against the wrong patient · entered in error · other. Recorded in error: wrong patient · wrong medicine or quantity entered · never handed over · other. Adjustment: damaged · expired, removed · lost · found on the shelf · other. Batch choice other than first to expire: a short coded list. Count difference: a short coded list.

**Supply without a pharmacist** (only if D-PH1-05 is on). A short coded list, starting from "no pharmacist on duty".

**Payment exemption reasons** (only if the hospital uses payment status).

**Identity routes.** The short list offered under "Identified another way" (Appendix B).

**Query codes and answer reasons.** Type of problem: allergy · dose unclear or unusual · duplicate · renal function · not available, alternative needed · other. The prescriber's reasons for keeping a line: a short coded list for signature. The pharmacy's reasons for withdrawing a query: answered another way · prescriber could not be reached · sent in error · other.

**The substitution rule.** One paragraph for signature, starting from D-PH1-14, with the list of forms where a strength change is never allowed, and the coded reasons for a strength change.

**Labels.** Fields and their order · warning lines · additional instructions · label size per dispensing point. Starting points, neither of them a legal reading: section 13(4)(a) of the Act, as read for this prompt, calls for a supplied restricted drug to be labelled with the supplier's name and address (Appendix E); a dispensing procedure dated November 2023 and hosted by Joint Medical Store lists the patient's name, the facility's name, the generic name, strength, quantity, dose and duration. The Ministry's manual, chapter 8, is the authority; it was not read for this prompt.

**Plain-words templates.** Columns: the structured pattern · the words · languages · signed. Empty until someone drafts them.

**Counselling points and languages.** Proposed points: what each medicine is for · how and when to take it · what to do about a missed dose · side effects to come back for · the medicine to buy outside and where the paper is. Languages: set by the hospital.

**The availability mapping.** State → level in the prescribing dialog (D-PH1-22).

**The hospital's message name.** One neutral name per hospital (D-PH1-39).

**The dispensing log's columns.** The pharmacy in charge copies the column headings from the hospital's current HMIS 016 book, in order, and maps each to a fact MedSync holds. Columns MedSync cannot fill are listed.

**Reorder levels, count freshness and the expiry look-ahead.** Operational figures set by the pharmacy in charge. Not signed by the CSO.

## Appendix E: Legal questions, and sources checked (11 Oct 2026; re-verify at build time)

**Questions for the lawyer and the regulator.** Questions 1 to 6 need at least an interim written answer before GATE A is signed and before any point goes live (RD-1). Question 7 gates live SMS. Question 8 gates nothing; until it is answered, nothing is deleted.

1. Who may review and who may dispense in a hospital pharmacy: a pharmacist, a pharmacy technician, other staff; and whether a dispensing point needs a pharmacist in charge. Which body registers pharmacy technicians. Whether hospital staff supply under an order of the National Drug Authority (section 13(2)(c)), and what that order says.
2. Whether an electronic record can serve as the Prescription Book (section 13(4)(b)) or the Classified Drugs Book (section 24), and how section 20(4)(b) (supply from the dispensing department of an approved institution, under the Minister's regulations) applies to a hospital pharmacy. Which regulations exist.
3. Whether an electronic prescription satisfies section 20(2) for Class A and Class B Group I drugs ("indelible writing, dated and signed").
4. Which narcotics statute is in force beside the Act, and what it adds for a hospital pharmacy.
5. Whether a not-supplied slip that goes with the patient's signed prescription lets another pharmacy supply the rest; what the slip may and may not say; and who keeps the original when a prescription is only partly dispensed (sections 20(3) and 21(b)).
6. What particulars a dispensed medicine's label must carry (sections 13(4)(a) and 25 refer to "prescribed particulars"; the instrument was not found).
7. The basis under the Data Protection and Privacy Act 2019 for sending a patient an SMS about their medicines, and what consent it needs.
8. How long MedSync must keep supply records.

**Sources**

- **National Drug Policy and Authority Act,** consolidated text at 31 Dec 2023 on ULII. Read through an automated extract of the first 100,000 of about 111,000 characters; the schedules were not read. As numbered there: only a registered pharmacist, medical practitioner, dentist, veterinary surgeon or licensed person may supply or dispense a restricted drug (s. 13(1)), with an exception for hospital staff acting under an order of the Drug Authority (s. 13(2)(c)); a supplied restricted drug is labelled with the supplier's name and address (s. 13(4)(a)); the Prescription Book is written up within twenty-four hours of supply (s. 13(4)(b)); a Class A or Class B Group I drug is supplied only on a prescription that is in indelible writing, dated and signed, names the prescriber and the patient with their addresses, and gives the total amount and the dose (s. 20(1), (2)); that rule does not apply to supply from the dispensing department of an approved institution under the Minister's regulations (s. 20(4)(b)); a fully dispensed prescription is kept on the premises for two years (s. 21(b)); before supplying a Class A, B or C Group II drug the supplier enters it in the Classified Drugs Book, with the signature of the person it is delivered to (s. 24(1), (2)). **This is a summary of what the text says, not a legal reading**, and how these sections apply inside a hospital is question 2. https://ulii.org/en/akn/ug/act/statute/1993/13/eng@2023-12-31
- **Narcotic Drugs and Psychotropic Substances (Control) Act, 2024** (Act 2 of 2024), ULII text dated 23 Feb 2024, read the same way. It comes into force on a date the Minister appoints by statutory instrument (s. 1); **whether it has commenced was not confirmed**. A pharmacist supplies a narcotic drug or psychotropic substance only where a medical practitioner has prescribed it (s. 7(2)). Records the Authority prescribes are kept by a licensee for seven years (s. 14(2)). It repeals sections 47 to 49 of the National Drug Policy and Authority Act (s. 86). https://ulii.org/en/akn/ug/act/2024/2/eng@2024-02-23
- **Essential Medicines and Health Supplies Management Manual, July 2023,** Ministry of Health. The contents were read: chapter 7 Requisitioning and Issuing Supplies; chapter 8 Dispensing Medicines, with the Daily Dispensing Log (HMIS 016) at section 8.5; chapter 13 Management of Narcotic Drugs and Psychotropic Substances, with Class A drugs at 13.2 and storage, issue and dispensing at 13.3 to 13.4; section 18.4, the Expired or Spoiled Medicines Register. **Chapters 8 and 13 themselves were not read**: the copy reached was cut short. The pharmacy in charge supplies them at Step 1. https://guluhospital.net/wp-content/uploads/2023/10/2023-EMHS-Manual_MASTER_COPY_31st-July-2023.pdf
- **HMIS Health Unit Procedure Manual, volume 1, August 2010,** list of forms: Stock Card (HMIS 015), Prescription and Dispensing Log (HMIS 016), Requisition and Issue Voucher (HMIS 017), Stock Book (HMIS 083), Discrepancy Report (HMIS 087), Expired or Spoiled Medicines Register (HMIS 088). These are the 2010 numbers and the 2010 name for form 016; the columns were not read. Confirm each against the hospital's current books.
- **A dispensing procedure dated 25 Nov 2023, hosted by Joint Medical Store;** its issuer is not named. It lists the label fields quoted in Appendix D and the points a patient is told. A starting point for the label pack, not an authority. https://jms.co.ug/wp-content/uploads/2026/05/13.-PROCEDURE-FOR-DISPENSING-MEDICINES.pdf
- **Carried from Phase 0:** the Pharmacy and Drugs Act (the Pharmacy Board and its registrar; the text read does not mention pharmacy technicians); the Ministry of Health's letter of 18 Sept 2026 on licensing powers; section 14(1)(b) of the National Drug Policy and Authority Act on a pharmacist's supervision of a licensed retail business.
- **Not verified:** the dispensing chapter's procedure and label requirements; the columns of HMIS 016; the Ministry's rules for Class A drugs in a hospital; any guidance on electronic prescriptions or registers; the registering body and scope of pharmacy technicians; the current state of the repo, which was not read for this prompt.
