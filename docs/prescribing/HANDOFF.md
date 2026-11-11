# Prescribing protocols — P1 handoff (F1–F3, the one Prescribe)

Branch `feat/prescribing-protocols`, worktree `~/Desktop/medsync-rx`. Built dark behind **`PRESCRIBE_V2`**
(`1` or hospital ids; needs `EMR_V1` + `EMR_PRESCRIBING`; off in production while `PRESCRIBE_COPY` is draft).
Flag off, every page and every check reads exactly as before.

## Owner to do

1. Apply the migration: `cd /Users/airm1/Desktop/medsync-rx && npm run db:migrate` — **0279** (GATED):
   `prescriptions.prescribe_place`, `prescriptions.product_id`, table `prescription_drafts` (RLS forced, no client access).
2. Sign the draft copy: `content/prescribing.ts` (`PRESCRIBE_COPY`), the order sets list
   (`lib/prescribing/order-sets.ts`, `ORDER_SETS_STATUS`), and `RX_CHECKS.prescriberSaid` in
   `content/pharmacy-rework-daily.ts` (now "Prescriber saw it and answered: …").
3. Set `PRESCRIBE_V2` for a test hospital.

## Where each P1 feature landed

| Feature                                    | Where                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| One dialog, opened from six places         | `components/clerking/plan/prescribe-dialog.tsx` (editor) + `prescribe-session.tsx` (`PrescribeButton`, session dialog) |
| — clinic visit / ward round                | `components/emr/prescribing/encounter-prescriptions.tsx` (`placeOfEncounter`)                                          |
| — clerking plan                            | `components/clerking/plan/plan-step.tsx` (`envOfPlan`, own basket/draft as before)                                     |
| — resus                                    | `app/nurse/resus/[episodeId]/page.tsx` (prescribing cadres only)                                                       |
| — NCD clinic                               | `app/ncd/visit/[visitId]/page.tsx` (finds the open visit)                                                              |
| — going home                               | `lib/emr/read/close.ts`, `components/emr/desk/close-visit.tsx`                                                         |
| Collect point per place                    | `lib/prescribing/places.ts` (`PLACE`), stock via `stockLinesFor(…, origin)`                                            |
| Patient facts strip (sex, eGFR, pregnancy) | `components/clerking/plan/medicines.tsx` (`FactChips`)                                                                 |
| Search, groups, keyboard pick              | `prescribe-dialog.tsx` over `formularyBrowse()`                                                                        |
| Order sets                                 | `lib/prescribing/order-sets.ts`, applied in `prescribe-session.tsx`                                                    |
| Brand choice                               | `brandsFor` in `lib/emr/read/prescribe.ts` (`pharmacy_products`), star per viewer in localStorage                      |
| Regimen dosing, bands, mg/kg               | existing `resolveRegimens`; "Changed from the regimen" + "Use the regimen" in the dialog                               |
| Supply quantity                            | `lib/prescribing/supply.ts`, recomputed on the server in `prescribeFromPlan`                                           |
| Checks                                     | `lib/prescribing/plan-checks.ts`: cross-reactivity, eGFR CKD-EPI 2021 (`egfrOf`), pregnancy, limits (v2 only)          |
| Basket, draft, review, Sign and send       | `prescribe-session.tsx`; server `sendPrescribed` / `keepPrescribeDraft` in `lib/emr/write/plan.ts`                     |
| Already prescribed, again, stop            | `loadPrescribeSession` + `stopPrescribedLine` (`lib/emr/actions/prescribe.ts`)                                         |
| Server gates                               | `lib/emr/actions/prescribe.ts`: cadre, flag, every check re-run from the record in `placePlan`                         |

## Defaults taken

- No amoxicillin regimen is signed, so production shows **no dose** for it. Weight bands and mg/kg are proven
  with a TEST FIXTURE regimen in `tests/prescribing/prescribe-v2.test.ts`.
- Kidney: eGFR G1–G2 passes, G3a and below is a Check (KDIGO bands). No per-drug renal advice (none signed).
- Pregnancy: asked for women 12–55; pregnancy advice shows only when the dose is CSO-signed.
- Limits: Stop above a signed regimen's own `perKg.max`; otherwise "not checked".
- The prototype's interaction pairs, LIMITS and ALT alternatives were **not ported** (unsigned clinical data).
  Interactions use the existing signed pairs; alternatives are the existing "elsewhere" stock points.
- Order sets hold drug ids only (no doses); each line opens the editor. Hidden in production while draft.
- Stop reason is stored as `reasonCode: "other"` with the typed reason.
- Kept, not deleted: `prescribe()` in `lib/emr/write/prescriptions.ts` and `lib/prescribing/engine.ts` still
  serve the flag-off path. Delete both when `PRESCRIBE_V2` replaces the old forms everywhere.

## Not done, and why

- Ward bed board entry: the board's data carries no patient id by design.
- Resus panel "administer" dialogs stay: they record cart administrations, which is P2.
- NCD registry medicine list stays: it is registry capture, not prescribing.

## Tests

- `tests/prescribing/prescribe-v2.test.ts` (unit, 10).
- `tests/emr-db/prescribe-scenarios.test.ts` (PGlite lane, S1–S3).
- `tests/emr-db/drizzle-parity` has 12 failures on tables this branch did not touch (pre-existing drift);
  `prescriptions` and `prescription_drafts` pass.

---

# P2 (b) Nursing (F5): nurse tasks and the medicine chart

Behind the nurse side of **`PRESCRIBE_V2`**: `nurseTasksLiveFor` (`lib/emr/feature.ts`) = `PRESCRIBE_V2` + `EMR_PRESCRIBING`,
off in production while `PRESCRIBE_COPY` or `NURSE_TASKS_COPY` is draft. Flag off: no task is raised, the Tasks card
stays a placeholder, the MAR page is the free-text form only.

## Owner to do

1. Apply **0281** (GATED, after 0279/0280): `cd /Users/airm1/Desktop/medsync-rx && npm run db:migrate`. Table
   `nurse_tasks` (RLS forced, reader's scoped SELECT, no client grants, one-way trigger: open → done | cancelled, then
   frozen, never deleted; audited) and on `medication_administration_records`: `client_key`, `reverses_id`, state
   `reversed`. The Drizzle schema names the new MAR columns, so apply before deploying this branch.
2. Sign `content/nurse-tasks.ts` (`NURSE_TASKS_COPY`, draft; the cannula sizes and sites are the prototype's lists).

## Where it landed

| Feature                            | Where                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task raised on send                | `raiseIvTaskOnSend` (`lib/emr/write/nursing.ts`), one call at the end of `sendPrescribed` (`lib/emr/write/plan.ts`)                                                                    |
| Generic task insert (P4 uses it)   | `raiseNurseTask`: type, source kind + id, payload, due_at, client key                                                                                                                  |
| Tasks page                         | `app/nurse/tasks/page.tsx` + `_components/task-list.tsx`; sidebar item un-dimmed and overview card linked when on                                                                      |
| Cannula done → line on the patient | `completeIvTask`: a `procedures` row ("Peripheral IV cannula 18G, left forearm", laterality) + task outcome; `ivLinesFor` shows it on `app/nurse/patients/[patientId]`                 |
| Result on a task                   | `completeResultTask` → `enterResults` (its own gates: nurses enter bedside tests only), task outcome `{reportId}`                                                                      |
| Given / Withhold                   | `recordDose` against the prescription line (drug, dose, route from the line, never the screen); `app/nurse/mar/_components/chart-doses.tsx` over `loadNurseMar` (reuses `buildMarRow`) |
| Undo                               | `reverseDose`: a reversal row with the reason, once; `liveDoses` (`lib/emr/charts/build.ts`) drops the pair, also in `lib/emr/read/monitoring.ts`                                      |
| Server actions                     | `lib/emr/actions/nursing.ts` (surface `nurse`, flag gate; cadre gate NURSE_CADRES in each write)                                                                                       |

## Defaults taken

- "No line recorded" = no done `iv_cannula` task on this visit and no open one for the patient. A cannula noted only in the
  examination's free text is not seen; no resite/removal yet (marked `ponytail:`).
- One task per send for all its IV lines; due now unless every IV line starts at the next round.
- Size and site have no preselected value (the prototype's 20G / left hand defaults would be invented data).
- High-alert and controlled lines are not given from this chart (no enrolled-nurse co-sign or CD witness here); they keep the
  free-text Medications form / CD dose page, and the chart says so.
- No UPDATE/DELETE trigger on the MAR itself (0031 table; demo-removal paths delete): the new writes are insert-only.
- Tasks list shows the patient code, not the name (no per-row PHI decrypt).

## Not done, and why

- Protocols running on the Tasks page: P4 (no runs exist yet).
- Nothing raises `enter_result` tasks yet: no signed rule says when; P4's charts will (`raiseNurseTask`).
- Pharmacy reads of the MAR still count a reversed dose as given (pharmacy folders are P2 (a)'s).
- No browser check at 390 px: needs 0281 on a database and a nurse sign-in; layouts are single-column flex-wrap.

## Tests

- `tests/emr-db/nurse-tasks-scenarios.test.ts` (PGlite lane, 3): S5, Given / Withhold / undo, result on a task.
- `prescribe-scenarios` (S1–S3) still pass; `drizzle-parity`: `nurse_tasks` and the MAR pass (same 12 old failures).

# P2 (a) Pharmacy — the pharmacy hand-off (F4)

All behind `PRESCRIBE_V2` (now also gated on `PRESCRIBE_HANDOFF_COPY`, draft); the queue, query and witness
are the pharmacy rework's, plugged into, not rebuilt. Flag off: no column is required, no word changes.

## Owner to do

1. Apply **0280** (GATED, after 0279): `cd /Users/airm1/Desktop/medsync-rx && npm run db:migrate` —
   `pharmacy_handovers.explained_attested boolean NOT NULL DEFAULT false`.
2. Sign the draft copy `PRESCRIBE_HANDOFF_COPY` in `content/pharmacy-prescriber.ts` (line words, the
   hand-over confirmation and its refusal).

## Where it landed

| Kit F4                               | Where                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line states (prescriber)             | `rxWord(r, place, status)` in `lib/prescribing/places.ts` maps the folded pharmacy stage (`lib/pharmacy/lines.ts`) to Waiting at pharmacy / Pharmacy asks you / Owed, given later / Handed over / Stopped (+ Changed, Buying outside, Not supplied, Waiting for co-sign)                                    |
| Line states (pharmacy)               | unchanged: the rework's signed words and Dispense tabs (Waiting, Queried, Ready to collect, Owed, Handed over)                                                                                                                                                                                              |
| Holds                                | existing stages: co-sign → `awaiting_cosign`; talk to the prescriber → `queried`; patient not here yet → `ready` (decided, not collected). No new hold event                                                                                                                                                |
| Statuses and questions in the dialog | `loadPrescribeSession` reads `prescriberViewIn` (new, `lib/pharmacy/review/prescriber-read.ts`, same view as the plan's, inside the session's transaction, every placed line's stage)                                                                                                                       |
| Answer Keep / Change / Stop          | `prescribe-session.tsx` renders the plan's `PharmacyItemBlock` under each "already prescribed" line; Change opens the editor and sends the line with `replaces` through `sendPrescribed` (server answers the query `changed`); Keep / Stop use `answerQuery`. `PharmacyHandlers.onDone` reloads the session |
| Count before opening                 | `encounter-prescriptions.tsx`: "n from the pharmacy" beside Prescribe                                                                                                                                                                                                                                       |
| Hand-over confirmation               | `explainedAttested` on `HandoverInput`; `checkHandover` refuses `explained` when `explainRequired` (actions pass `prescribeV2LiveFor`); tick on the hand-over screen. Identity (two identifiers) and the controlled witness are the existing ones                                                           |
| Controlled witness                   | unchanged: the plain hand-over refuses a controlled line; `recordControlledSupply` (witness, count, register)                                                                                                                                                                                               |
| Resus lines                          | `dispensable()` in `lib/pharmacy/read.ts` (not emergency, `prescribe_place` not resus) in every dispense read: queue, review/hand-over loader, prescription read, downtime entry. Never queued, staged or handed over; the cart is restocked by the existing cart check (EC-1, count-based)                 |
| MAR reversals (0281)                 | `liveDose()` in `lib/pharmacy/clinical/read.ts` (given, not undone by a `reversed` row) in the clinical, reconciliation and stewardship reads; the same NOT EXISTS in the ward, recall, ward-stock and demo SQL                                                                                             |

## Defaults taken

- Pharmacy keeps its signed words; the kit's pharmacy column is the same stages, not relabelled.
- Resus lines are not added to the cart check's "recorded uses": the line names no cart (the dialog does
  not ask for one). Add a cart choice to the resus dialog if the pharmacy wants them listed.
- The answer loop shows on the doctor surface only (the existing answer actions are `surface: "doctor"`).

## Not done, and why

- A "Change it" line still raises "Already prescribed" against the line it replaces (client and server
  agree, the prescriber answers it). Excluding the replaced line belongs in `placePlan`'s `others`
  (`lib/emr/write/plan.ts`, P1, not touched).

## Tests

- `tests/emr-db/prescribe-handoff.test.ts` (PGlite, 4): S4 query → Change it → hand-over refused without
  then recorded with the confirmation; controlled line refused by the plain hand-over; resus line never
  queued or handed over; a reversed MAR dose is not counted.
- Re-run green: pharmacy-prescriber, pharmacy-stock-answer, pharmacy-controlled, pharmacy-supply,
  pharmacy-review, pharmacy-downtime-entry, prescribe-scenarios, pharmacy-clinical-data, pharmacy-demo-\*,
  pharmacy-stores-supply, pharmacy-reads; unit `tests/pharmacy` + `tests/prescribing` (1468).
  drizzle-parity: the same 12 pre-existing failures; `pharmacy_handovers` passes.
