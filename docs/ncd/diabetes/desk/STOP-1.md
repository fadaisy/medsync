# STOP 1 — The diabetes pack reads the ten-step clerking (ADR 0216)

Branch `feat/ncd-dm-desk`, worktree `medsync-ncd`, 2026-10-08. Built, off (`NCD_DM_DESK`).

## Built

- `lib/ncd/pack/from-clerking.ts`: the clerking record → the pack's input. 142 of 208 pack features mapped (about 47
  renames, 95 derived); 62 asked in "More diabetes questions" (46 after the Core 12, below); 4 unused. Blank is never negative.
- Loader: creatinine, potassium, lipids, urine protein and ketone strips, pregnancy gestation and weeks post-partum.
  eGFR from creatinine with the registry's CKD-EPI 2021.
- `lib/ncd/pack/desk.ts`: flags (interrupt urgent; today and medicines caution, red flag urgent), the Impression verdict,
  when the profile shows. `components/clerking/diabetes-profile.tsx`; Plan "Diabetes: due and targets".
- Impression: type 2 and "type not yet determined" merge into one chip led by the pack's verdict; type 1 keeps its own.
- "More diabetes questions": the module form cut to what the clerking does not ask, no panel (`more-questions.ts`).
- Flag `NCD_DM_DESK` (`1` or hospital ids; needs `CLERKING_V2`). Off: nothing changes.

## Checks

typecheck ✓ · lint ✓ · 9,225 tests ✓ (PGlite lane on) · build ✓. New: `tests/ncd/pack-from-clerking.test.ts` (25),
`tests/ncd/pack-desk.test.ts` (5), `tests/clerking/ncd-dm-desk.test.ts` (4, end to end through deriveDesk).

## Needed from you

1. Sign the 42 mapping rulings (`mapping-rulings.md`), especially MR-01 (laboratory glucose counts for 24 hours, because
   every emergency rule reads it) and MR-19 (a medicine the patient stopped taking still counts as prescribed).
2. Choose which "More diabetes questions" move into the clerking steps (Phase 2, CSO-signed catalogue additions).
3. To try it: in Vercel, add `CLERKING_V2` and `NCD_DM_DESK` (your hospital id, or `1`) to Preview, then open a preview.

## Not done

- Catalogue additions for the most important missing questions (Phase 2).
- "A second result on another day" is asked, not derived (MR-40); gestation from an EDD alone (MR-39).
- Desk flags from the clerking catalogues (e.g. high ketones) can sit beside the pack's interrupt for the same event.
