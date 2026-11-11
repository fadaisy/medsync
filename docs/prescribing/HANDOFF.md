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
