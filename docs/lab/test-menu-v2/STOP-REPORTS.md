# Lab test menu v2: STOP reports

Branch `feat/lab-test-menu-v2`, cut from `origin/main` 4aa0214d (19 Oct 2026). Worktree `~/Desktop/medsync-tm2`.
The owner (Fadhul, CSO) approved every STOP and GATE in advance on 19 Oct 2026, with the Section 10 recommendations
(TM-D01 to TM-D12) as the signed decisions. So the steps ran straight through. Each report is brief.

## STOP 0: Discovery and baseline

**Repo against the prompt (the repo wins)**

1. `feat/lab-workspace-v2` **has merged** (PR #245, 4aa0214d), though the brief said it had not. The screens are built
   inside its shell: `SetupHeader`, the places and tabs in `lib/lab/places.ts`, tokens only.
2. The hub's lab section codes (A.3, `LAB_SECTIONS`) use `serology_immunology`. The catalogue uses
   `immunology_serology`. The other seven keys match. A one-line alias maps them (`hubSectionCode`).
3. `hospitals.level` holds `hc3 · hc4 · district · regional · national_referral · private`. The catalogue uses
   `HC III … NRH`. They are mapped in `levelOf`.
4. `test_catalogue.specimen_type` and `container` already exist as enum keys that labels and the order sheet read.
   The catalogue's Ugandan wording goes into two new columns, `specimen` and `tube`. Nothing reads them in a new way.
5. The restricted classes in the repo are `hiv · tb · mental_health · sexual_reproductive_health`. The catalogue's
   `srh` maps to `sexual_reproductive_health`.
6. CrAg is `hiv` (Phase 2 P9, signed); the catalogue proposes no class. The import never clears a class, so CrAg
   stays restricted.

**Q1 (TM-U1 to TM-U7): confirmed from code and from the handbook session's capture of Test Hospital-1**

- The Diagnostics page reads `loadTestCatalogue()` = `SELECT code, display, category FROM loinc_codes`: 97 rows,
  88 of them category "Laboratory" (0158). It writes through `ha-services-hub` `upsert_offerings`, which checks each
  lab code against `loinc_codes`. The reason is in the page's comment: the build keyed DX-1 to LOINC.
- Each row has its own provision, section, hours and turnaround. FBC = 27 rows (26 match its results by LOINC; `20570-8` haematocrit matches no concept). C3, C4, ANA and anti-dsDNA are absent.
- Test Hospital-1 has 30 rows set (29 in-house, 1 referred, `DEMO-REF-TFT`). 67 are not set. No other hospital has any.
- The lab's own Set-up → Test menu links tests to hub rows (`lab_test_services`), so one fact lives on two screens.
- There is no way to ask for a missing test.
- Screenshots: not taken. The production pages need the owner's sign-in. The counts come from the capture in the
  shared notes (`lab-handbook-build/diag-offs.json`, `stats.json`).

**Q2.** Offerings are in `diagnostic_offerings` (PK hospital, kind, code; code any `[A-Za-z0-9._-]{1,40}`). A test id
such as `test.fbc` fits, so the table is re-keyed by test id with no new offering table. `test_catalogue` is 0071's
table plus `restricted_class` (0107) and `patient_group` (0154). Concepts are in `clinical_concepts` and the
generated `lib/facts/catalogue.generated.ts`. OM-1's `offering_code` is filled by hand in `lab_test_services`.

**Q3.** Production counts are the owner's (no database access here). From the capture: Test Hospital-1 has 30 rows.
Orders keep their `availability_snapshot` and `loinc_code` and are never touched by this work.

**Q4.** Lab sections are hub units of LABORATORY (`hospital_departments.catalogue_code` from A.3). The worklist
matches a row to a unit by `diagnostic_offerings.section_id` (LW-3). There is no catalogue section today.

**Q5.** The order sheet filters `MenuTest` by `display`, `code` and component displays (substring). There are no
aliases, so "RFTs" and "B/S" find nothing.

**Q6.** Merged; the v2 shell is used.

**Q7.** Baseline for an RRH menu: 4 interactions per row (where, section, hours, save) × 97 rows ≈ 390. A 10-test
sample is 10 × 4 = 40.

**Q8. Catalogue file**

| Check                  | Expected                                | Found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests                  | 291                                     | 291: 33 flagged existing, plus 7 more already in the repo (`test.rpr`, `test.tpha`, `test.dual_hiv_syphilis_rdt` from v1.6; `test.ogtt_75g`, `test.blood_gas`, `test.c_peptide`, `test.b12_folate` from the v1.5 NCD pack), so 40 existing and 251 new                                                                                                                                                                                                                                                                                                       |
| Concepts               | 437 new                                 | 437; 9 ids already exist (`obs.hb_phenotype`, `obs.magnesium`, `obs.phosphate`, `obs.uric_acid`, `obs.amylase`, `obs.lipase`, `obs.upcr`, `obs.c_peptide`, `obs.vitamin_b12`) and are kept as they are, so 428 are added                                                                                                                                                                                                                                                                                                                                     |
| Unknown component ids  | 0                                       | 2: `obs.blood_culture_gram_stain` and `obs.blood_culture_organism`. Phase 2 F-4 held both for the microbiology phase, and the catalogue does not define them. They stay held                                                                                                                                                                                                                                                                                                                                                                                 |
| Unverified codes       | 13                                      | 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Changed existing tests | troponin, uacr, blood_culture, syphilis | troponin +`obs.troponin_i`; uacr +`obs.urine_albumin`, +`obs.urine_creatinine`; blood_culture +`obs.ast_interpretation` (the two F-4 concepts held); syphilis already narrowed by v1.6. The four v1.5 NCD tests keep their result lists (another signed pack owns them; blood gas would otherwise carry both `obs.ph` and `obs.bg_ph`), listed in the import report. The file lists five tests with their v1 components where v1.6 changed them (d_dimer, blood_group, lipid_panel, hiv_rapid, tb_xpert). Nothing is removed (research note), so v1.6 stands |

The TM-6 snapshot counts match the prompt exactly: HC III 33/69, HC IV 61/83, GH 110/69, RRH 151/64, NRH 197/88.

STOP 0 approved in advance.

## STOP 1: GATE A

`gate-a-proposal.md`: signed by Fadhul (CSO), 19 Oct 2026, on the recommendations as written.

## STOP 2: Data layer

- **0171** `lab_test_menu_v2`: TM-2 columns on `test_catalogue`; `section_override` and `stated_turnaround_minutes` on
  `diagnostic_offerings`; `lab_settings.hidden_sections`; `lab_order_profiles`; `lab_catalogue_requests`.
- **0173** `lab_indicator_source_by_test`: 0118's indicator source, reading offerings by test. It was found at the lane
  run: 0118 joined the removed link.
- RLS is forced on both new tables, which carry audit triggers.
- Client roles cannot write.
- Drizzle parity is green.

**RLS probes** (PGlite, `tests/emr-db/lab-test-menu.test.ts`), on profiles and requests:

| Actor                 | Own hospital | Other hospital | Write   |
| --------------------- | ------------ | -------------- | ------- |
| Staff (authenticated) | reads        | none           | refused |
| Clinical reader       | reads        | none           | —       |
| anon                  | none         | none           | —       |

## STOP 3: Catalogue v2 import

- See `import-report.md`. 251 new tests (inactive), 40 existing tests updated, 428 results, 13 unverified codes.
- S1–S4 pass:
  - a second run of 0172 changes nothing;
  - unsigned tests cannot be added or ordered;
  - once signed by both, the tests are addable, the additions are appended, and observations are untouched.

## STOP 4: Engines

- `lib/lab/test-menu.ts` is pure.
- `tests/lab/test-menu.test.ts`: 22 tests, covering:
  - TM-4 `sectionFor` property over 291 tests × 8 overrides;
  - the TM-6 snapshot, exact;
  - the TM-7 never-overwrites property (5 levels × 20 menus);
  - TM-8 ranking, accents, S14 searches and masking (S10);
  - TM-9 agreement and conflicts;
  - TM-10 names;
  - §9 identifiers;
  - the search budget (p95 < 50 ms) and the filter budget (< 100 ms over 291 rows).

## STOP 5: Test menu screen

- One component, `components/lab/test-menu/test-menu.tsx`, serves `/lab/setup/menu` and
  `/hospital-admin/departments/diagnostics` (S9: one store).
- S5: a row is a test, and FBC expands to its results with the results line.
- S6: Changed from, and back to Recommended (PGlite).
- S7: three audit rows (PGlite).
- S8: section hours go to in-house rows only (the dialog's rows are filtered to in-house).
- S10: masking at the read (the hub admin sees "Restricted test").
- Screenshots and axe: see STOP 11.

## STOP 6: Start from your level, Add tests, Test detail

- Built in `dialogs.tsx`.
- S11: RRH on an empty menu adds 215 = 151 + 64, with stated turnaround null.
- S12: applying again adds 0.
- S13: GH over an edited menu adds 178 and keeps the edit.
- S14: covered by the engine tests.
- S15: low-value tests appear in no template; Add tests shows the advisory.
- S16 counts 15 interactions, the budget exactly (today it is about 390):
  - open Start from your level, then Add 215 tests: 2;
  - Set hours for the section, choose, Apply: 3;
  - ten rows' Where set to Referred, one click each (it saves at once): 10.

  Doing the referred step with the bulk bar instead costs 12 (10 ticks, Where, Apply), 17 in all. That count is
  by design, not measured in a browser.

## STOP 7: Migration of existing settings

- `npm run lab:migrate-offerings` (TM-9): a dry run by default; `--apply --actor` writes.
- `migration-report.md` is the dry run from the Test Hospital-1 capture: 30 rows become 27 tests, with 0 conflicts
  and 2 unmapped rows. The prompt expected about 8; see GATE A §2.
- S17 and S18 pass on PGlite:
  - test rows are created once;
  - a second run plans nothing;
  - orders and their snapshots are byte-identical.

## STOP 8: Profiles and ordering

- Board 17 is `profiles.tsx`. The order sheet shows profiles, alias search (TM-8) and the advisory before adding.
- S19: one line per test, and the syphilis line is restricted (PGlite).
- S20: masking at the read and on the order sheet's existing marks.
- S21: names are refused (engine and action).
- S22: profiles are flagged when a test is not offered.

## STOP 9: Ask for a test

- The form and the list under it are in `dialogs.tsx`; the queue is at `/admin/lab-catalogue-requests`.
- S23: the request is stored.
- S24: added needs an active catalogue test, and the requester sees the state.
- S25: a decline without a reason is refused by the check constraint (PGlite).

## STOP 10: Per-LOINC page removed

- Diagnostics → Laboratory is the new menu, and `?test=<LOINC>` redirects keeping its other filters.
- `upsert_offerings` refuses lab rows. Hub problems name catalogue tests.
- Every reader of `lab_test_services` is re-keyed by test: one menu, worklist, equipment, EQA, HMIS, register,
  reports, IPC, the set-up hub and indicators (0173). The table stays, unread.
- S26: `tests/lab/test-menu-hardening.test.ts`.

## STOP 11: Hardening

**Harness.** A copy of the Workspace v2 harness at `~/Desktop/tm2-harness` (PGlite seeded through the app's own
stores, then a production build on :4016). The fixture people signed `cfc-1.7.0`, then the RRH template was
applied. Shots, axe results and the plan are in `shots/`.

**Axe.** 0 violations of any impact on:

- board 13: menu at 1440 and 1280;
- board 14: level;
- board 15: add;
- board 16: detail;
- board 17: profiles.

**Horizontal scroll at 1280.** The first run found one: the grid column did not shrink, and sr-only labels escaped the table's scroller. Fixed with `minmax(0,1fr)` and a `relative` scroller; re-checked, there is no horizontal scroll at 1280 or 1440.

**Tests.**

- Law 9 (red reserved, nothing green, no gradients, no edge bars) and S26 are in `tests/lab/test-menu-hardening.test.ts`.
- Budgets: search p95 < 50 ms and filter < 100 ms (unit tests); interactions, see S16.

**Docs.**

- `docs/lab/LAB-DOCUMENTATION.md`: the test menu, and the owner's open items.
- ADRs 0350–0355, `CHANGELOG.md`, `docs/NUMBERS.md`.
- The Handbook and Engineering Guide are artifacts the handbook session owns: a hand-over note is in the shared
  notes folder (`lab-test-menu-v2.md`).
