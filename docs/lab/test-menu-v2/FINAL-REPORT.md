# Lab test menu v2: final report

Branch `feat/lab-test-menu-v2` (worktree `~/Desktop/medsync-tm2`), cut from `origin/main` 4aa0214d. Committed, not
pushed. All 12 steps are built. Reports: `STOP-REPORTS.md`, `gate-a-proposal.md` (signed),
`import-report.md` and `migration-report.md`.

## The owner applies, in this order

```sh
cd ~/Desktop/medsync-tm2 && npm run db:migrate
```

1. `0171_lab_test_menu_v2.sql`: schema, RLS, the two new tables.
2. `0172_cfc_v1_7_lab_test_menu.sql`: catalogue v2 as CFC v1.7 (generated). The new tests are inactive.
3. `0173_lab_indicator_source_by_test.sql`: the indicator source reads offerings by test.

Then, before deploying:

- `npm run lab:migrate-offerings`: a dry run, which writes `migration-report.md`.
- `npm run lab:migrate-offerings -- --apply --actor <your auth user id>`.

Edge Function to redeploy: `ha-services-hub` (it refuses lab rows; problems name catalogue tests).

## Checks (real numbers, 19 Oct 2026)

- `npm run typecheck`: clean (app and Edge Functions).
- `npm run lint`: 0 errors, 2 warnings (both pre-existing, `scripts/embed-bench.mjs`).
- `EMR_PGLITE=1 vitest run` (whole suite with the PGlite lane): 549 files passed, 24 skipped; 12,502 tests passed and
  250 skipped. The new lane file `tests/emr-db/lab-test-menu.test.ts` has 13 tests, all passing.
- The TM-6 snapshot matches the prompt exactly: HC III 33/69 · HC IV 61/83 · GH 110/69 · RRH 151/64 · NRH 197/88.
- Harness production build (`next build`): passes. Axe: 0 violations on boards 13–17 at 1440. A horizontal scroll at
  1280 was found and fixed (see `STOP-REPORTS.md` STOP 11).

## Where the catalogue or the repo said otherwise (repo wins)

- **Existing tests.** There are 40, not 33: v1.6 added rpr, tpha and the dual RDT; v1.5 (NCD) added ogtt_75g,
  blood_gas, c_peptide and b12_folate. So 251 tests are new. The four NCD tests keep their result lists, as another
  signed pack owns them.
- **Unknown components.** There are 2, not 0: blood-culture Gram stain and organism. They are held per Phase 2 F-4.
- **TM-9 on Test Hospital-1.** 30 rows become 27 tests, not "about 8", because analytes are shared across tests.
  There are 2 unmapped rows. Coverage is in the report.
- **CrAg.** It stays restricted (Phase 2 P9). The catalogue proposes no class, and the import never clears one.
- **`MAK_PATH`.** Added to the allowed `refer_to` values. No test is assigned to it: the file names none.
- **Free text.** 22 free-text results import as `as_typed`, which are never facts (A4).
- **Restricted results.** A result is restricted only when every test that reports it is restricted.

## Not done, or for the owner

- **In-product signatures.** The laboratory lead and the CSO sign addendum `cfc-1.7.0` in Set-up → Drafts. Until then
  the 251 tests show "Not yet signed". That page needs `LAB_CATALOGUE_V2` on.
- **Copy.** `LAB_TEST_MENU_COPY_STATUS` is a draft, including the restricted-names list.
- **Hub screenshots.** Not taken: the harness signs in as a lab lead only. The hub uses the same component.
- **Production counts (Q3).** These are the owner's. Only the Test Hospital-1 capture was used.
- **Handbook and Engineering Guide.** Both are artifacts. A hand-over note is in the shared notes folder for the
  handbook session.
- **Legacy data.** `lab_test_services` and the old LOINC-keyed offering rows stay in the database, unread. Drop them
  in a later migration once TM-9 has been applied.
- **Requester notification.** A request's state and reason show in the requester's list. There is no push or SMS.
