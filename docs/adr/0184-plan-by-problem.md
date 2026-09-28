# ADR 0184 — The Plan is organised by problem

**Status:** Proposed — 2026-09-28. Built dark behind `CLERKING_PLAN_V2` (needs `CLERKING_V2`); clinical wording is
draft until the CSO signs it. Pack: `docs/emr/clerking-v2/plan/` (PROMPT-CLERKING-PLAN §0, Phase 3).

## Context

Step 10 of the v2 desk still renders the v1 Plan section (`PlanBody`): an orders island, suggestions, one plan
statement and a narrative. Orders can name a problem (`reasonConditionIds`), prescriptions cannot, and nothing says
what must be true before the note is signed. The owner asked for the Plan to answer four questions in order:
where and how closely, what happens for each problem, what the patient already takes, and what must be true before
signing. The prototype (Prototype 7) did not arrive with the pack; the owner chose to build from the written
specification.

## Decision

1. **Four questions, in this order on the page.**
   1. _Where, and how closely:_ disposition (Admit with a ward, Observe in EU, Refer with a destination, Discharge),
      observation frequency (Continuous, Hourly, 4-hourly, 12-hourly) read against the signed NEWS2 response
      entries `CO-NEWS-01..05`, and senior review (Now, Within 1 hour, Routine).
   2. _By problem:_ one card per problem in Impression order (leading, the differential numbered, then "also this
      visit"), each with tests to decide, a must-not-miss box, suggested care, treatment by class and a plan note.
   3. _Medicines:_ the allergy line, the fact chips and admission reconciliation (Continue, Hold, Stop; Hold and Stop
      need a reason), then what is new this visit.
   4. _Before you sign:_ a computed checklist.
2. **Every order and prescription carries its problem.** Orders keep `reasonConditionIds` (condition version ids).
   Prescriptions gain `condition_id` (migration 0088) beside the free-text `indication`. The server refuses a
   superseded or entered-in-error problem, as `placeOrders` already does.
3. **One basket, one Place action.** Tests and prescriptions wait in a basket stored in the Plan draft; nothing is
   sent until **Place n orders and m prescriptions**. The server re-runs every order rule and every prescribing check
   on place, whatever the screen showed, and opens the monitoring charts the rule table names (ADR 0189).
4. **The draft lives at `content.plan`** of the clerking v2 note, as the exam, summary and impression drafts do, and
   is validated by `ContentV2Keys`. Placed items live in the record, not the draft.
5. **Mark plan done.** Enabled only when the checklist is clear. Any later change to the Plan draft or its record
   (a new order, a withdrawn prescription, a changed disposition) reopens it. Signing the note waits for "plan done",
   on screen and on the server.
6. **The note's Plan block is composed by fixed rules:** disposition; monitoring (with "fluid balance chart hourly,
   urine output measured" when a fluid chart is open); one numbered line per problem with its tests (priority and
   frequency, ordered or not yet), care items, prescriptions (with any override reason and "changed from default");
   talked through; follow-up.
7. **Suggested care is empty until a signed list exists** (owner decision). The section is built and reads "No signed
   care items for this problem yet". No care-item wording ships from the prototype.
8. **Flag.** `CLERKING_PLAN_V2` (`1` or hospital ids), only where `CLERKING_V2` is on. Off, step 10 renders the v1
   Plan unchanged.

## Consequences

- The Plan needs migrations 0087–0089 before the flag is turned on (ADRs 0185, 0186, 0189).
- The diagnosis → class links are shown as "Draft map, not CSO-signed" until signed (ADR 0187).
- The v1 desk and every other surface that places orders keep working; they send a frequency for routine orders
  (ADR 0185).
- Headings take their 600 weight from the type token (`DESIGN-medsync.md` wins over the prompt's "weight 500").

## Alternatives considered

- **Plan by order type** (all tests, then all medicines): what the v1 Plan does. Loses the reason for each order and
  cannot say whether a must-not-miss problem has been addressed.
- **Send each order as it is chosen**, as Impression's "Add to plan" does: quicker, but one mistaken tap reaches the
  lab or ward before the plan is complete, and the server cannot check the plan as a whole.
