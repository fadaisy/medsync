# STOP report — diagnosis relations (ADR 0220)

Branch `feat/dx-relations`, worktree `medsync-ncd`, 2026-10-09. All gates passed; nothing deployed.

## Gates and signatures (CSO)

- **GATE A:** all 17 decisions D-REL-01 to 17 as recommended; catalogues (subtypes, causes, risk factors) and the
  proposed terms signed. ICD-11 codes for the 12 seeded terms read on the WHO API and signed (five corrected).
- **Gate B:** build rulings STG-01..03, REF-01; D-REL-10 withdrawn (its premise was wrong); demotion asks then
  retires links; 90-day look-back.
- **Final gate:** STG-04/05; blank stages on the desk only; placeholder duplicate removal; "Considered and unlikely".

## Built (4 phases, commits b592506, 846a088, dfcd872 and the final commit)

1. Terms v1.2 (0095) and the signed catalogues; pure catalogue lookups, stages, stage inputs, risk line.
2. `condition_relations` (0096): append-only, RLS, loops/depth/differential refused, restricted classes from both
   ends, links retired by trigger when an end is removed; refine/replace; write/read paths; backfill report.
3. The board: places, linked shown once, known-condition chips, drag and drop, chooser, Relate to…, Undo,
   demotion confirm, swap, "Cause removed: review" enforced at signing, note in the design's order.
4. Refine/Replace dialog, deciding tests, stages (written at signing when changed), placeholders, risk line with
   "Include in note", look-back, collapse after 3, 19 vignettes as acceptance tests (8 parts skipped with reasons).

## Needed from you (owner)

> **Order matters: apply 0095 and 0096 BEFORE merging or deploying this branch.** The code reads the new
> `conditions.refined_from` column on every conditions query and the new `condition_relations` table; deployed
> first, every encounter desk would fail to load. Both migrations are additive (a new table, a new nullable column,
> a recreated view with one more column), so applying them first is safe with the code in production today.

1. **Apply the migrations, in order, from this worktree:**
   `cd ~/Desktop/medsync-ncd && npm run db:migrate -- --dry-run`, then `npm run db:migrate`
   - `0095_ref_dx_terms_v1_2.sql`: inserts 12 coded diagnosis terms (additive).
   - `0096_condition_relations.sql`: adds the relations table, its guard and RLS, and `conditions.refined_from`
     (recreates the `conditions_current` view).
     Then tell me: I flip the v1.2 terms to "coded" on the desk (one line in lib/clerking/impression/load.ts).
2. **Live on deploy (no switch):** the step 09 changes are not behind a flag; they apply to every ten-step desk once
   merged and deployed (after the migrations).

## Not built (deferred)

HMIS counting (D-REL-07), the death-certificate chain, automatic refinement from structured ECG/troponin,
per-user restricted classes (seam `app.restricted_classes`), malaria-in-pregnancy naming, TB resistance stage.
