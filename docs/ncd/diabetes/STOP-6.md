# STOP 6 (final): the diabetes pack, phases 0 to 6

MS-NCD-DM-PACK-001 0.4.0-draft on `feat/ncd-diabetes-pack` (worktree `medsync-ncd`), 2026-10-05. Signed at GATE A for the **shadow build only** (`gate-a-signoff.json`): computed and logged, shown to nobody. Not pushed, not deployed; migration 0092 not applied.

## Section 5 table

| Measure                                                    | Target                                  | Result                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vignette parity with `computed`                            | 83 of 83                                | **165 of 165** (the review rounds and the mutation test added 82 patients), field by field, TypeScript engine against the reference evaluator                                                                                                                                                  |
| Numeric predicates with no reference entry                 | 0                                       | **0**                                                                                                                                                                                                                                                                                          |
| Reference numbers not found in their claim                 | 0                                       | **0 on a switched-on item.** The second reader could not find 8 values in the pages that could be read and could not open 2 sources; each is marked needs-CSO (18 entries in all), and no switched-on rule, step or flag reads one                                                             |
| Strings that look like a dose                              | 0                                       | **0** (pack, clerking amendments); every new formulary entry `to-verify`                                                                                                                                                                                                                       |
| Items reading a restricted fact with no neutral display    | 0                                       | **0**; no leak of a restricted word in neutral text; the clerking patient-facing board shows none                                                                                                                                                                                              |
| Rules or flags live on an unsigned reference               | 0                                       | **0 live**: everything is shadow. All 351 references are status `draft`: GATE A signed the content for shadow, not each reference. Clinical go-live needs reference-level signing and the four-eyes reviewer                                                                                   |
| Catalogue ids guessed                                      | 0                                       | **0**: Phase 0 checked every id against the repo; the clerking catalogue check, the formulary test and the fact-contract tests fail on an unknown id                                                                                                                                           |
| Pack items dropped as duplicates of live ones              | report                                  | **Pack: 0.** It lives beside v0.1.0, not merged (Phase 2/3 report). **Clerking amendments: 3** semantic duplicates (DKA glucose, dm_type2 metformin, hypoglycaemia classifier levels), plus 8 items dropped by Phase 0 rulings (`phase-5/amend-diff.md`)                                       |
| Rules that fire on an empty record                         | 0                                       | **0** (pack: both sites, four bands, established or not; clerking: every new flag, suggestion and rule, three sexes)                                                                                                                                                                           |
| Outputs shown under 16 other than recognition and referral | 0                                       | **0**: every synthetic patient at ages 8 and 14, both sites, fires only suspect, confirm, classify and acute-route items, referrals, and therapy flags replaced by their "refer" text                                                                                                          |
| Acute-route rules whose removal no fixture notices         | 0                                       | **0**, and the same for red therapy flags and blocking caveats (mutation test)                                                                                                                                                                                                                 |
| Decisions signed / open                                    | 37 / 0                                  | **42 / 0** (37 plus D-DM-38 to 41 and one from the review rounds), and 28 Phase 0 rulings. New from Phase 5: 6 questions (STOP-5 §7)                                                                                                                                                           |
| Review findings fixed / open                               | 122 / 0, or each open one with a reason | 313 logged over the hand-over's review and rounds R4 to R10: **241 fixed, 31 fixed in part, 8 decided at GATE A, 22 ruled in Phase 0, 11 no change**, each with its reason in `review/REVIEW-LOG.json`. R10's fixes (V01 to V16) are proved by test patients but **not independently re-read** |
| Shadow run: rules firing on more than 20% of encounters    | report                                  | **2** on the 165 synthetic patients: the two counselling steps (DM-ACT-EDU-01, 02), expected. 51 items fire on none of them; each fires on a patient built to meet it (`phase-6/shadow-report.md`). No development data was read (owner's choice)                                              |

## Checks at this commit

| Check                                                               | Result                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run typecheck` (with `NODE_OPTIONS=--max-old-space-size=6144`) | pass                                                                   |
| `npm run lint`                                                      | 0 errors (2 old warnings in `scripts/embed-bench.mjs`)                 |
| `vitest run` with the PGlite lane (`EMR_PGLITE=1`)                  | 333 files passed, 21 skipped; **8,593 tests passed**, 238 skipped      |
| `npm run build`                                                     | pass; `data/ncd/diabetes-pack.json` is traced into the encounter route |
| `clerking:catalogue-check`, `ncd:check`, pack `build.py --check`    | ok; 0 errors; 0 errors, 0 warnings                                     |

Without a `.env.local` this worktree needs `SKIP_ENV_VALIDATION=1` for 15 test files that import `lib/env`.

## What was built

| Phase                                                                            | Commits                                     | Report                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| 0: the pack against the repo; UCG 2023 read at source                            | 0e78cef                                     | `phase-0-report.md`, `ucg/`                                    |
| 1: seven independent review rounds (R4 to R10), then GATE A                      | d8396bf … 0.3.7                             | `phase-1/review-rounds.md`, `gate-a.md`, `gate-a-signoff.json` |
| 2, 3: engine and content in shadow (`NCD_DM_PACK_SHADOW`)                        |                                             | `phase-2-3-report.md`                                          |
| 4: Design B                                                                      | skipped (owner)                             | the manifest stays the seam                                    |
| 5: clerking desk (`CLERKING_V2`)                                                 | 0e7da3a                                     | `phase-5/STOP-5.md`, `phase-5/amend-diff.md`                   |
| 6: CFC v1.5 + gated 0092, test menu, formulary, shadow report, ADRs 0204 to 0207 | 1d96aaa, 8cf2639, c8c1af1, 4fd5ea3, 1173208 | `phase-6/shadow-report.md`                                     |

## For the owner

1. **Apply** 0092 after 0083 and 0085 (gated, additive; re-running it adds nothing). Flags stay off.
2. **Before anything leaves shadow:** an independent read of R10's fixes (V01 to V16); the four-eyes second reviewer (D-NCD-17); reference-level signing (18 still need CSO input); a vignette for each of the 51 items no synthetic patient fires; replacing the live v0.1.0 engine with the pack's (the go-live step, with the Phase 0 rulings).
3. **Phase 5 questions** (STOP-5 §7): result windows for bicarbonate, pH, osmolality and HbA1c; a reason for `dx.diabetes_in_pregnancy` (withheld); an age range for "could be pregnant"; the three dropped duplicates; the steroid exclusions and classifier wordings; the "Stopped insulin" badge merge.
4. **Held, not built:** the proposed prescribing checks and chart rules; formulary links for diabetic kidney disease, gestational diabetes and neuropathy (no diagnosis profiles yet); the care-list engine (EC-4) until the list is signed.
5. The new formulary flags (renal, hepatic, high-alert) are draft proposals for CSO review.
