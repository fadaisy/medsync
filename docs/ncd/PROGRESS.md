# NCDSync build ledger

Prompt: `docs/ncd/PROMPT-NCDSYNC-BUILD-v2.md`. Worktree `~/Desktop/medsync-ncdreg`, branch `feat/ncd-registry` from
`origin/main` 8e45d34 (upstream unset; never pushed). Run mode: **continuous** (owner: "go through all gates").
Checks run with `EMR_PGLITE=1 SKIP_ENV_VALIDATION=1` and **no `.env.local`** in the worktree, so no test reaches a hosted
database; `tsc` needs `NODE_OPTIONS=--max-old-space-size=6144` on this 8 GB machine.

## P0 — Recon and conform · DONE

- Built: `00-RECON.md` (16 points with evidence), `01-DESIGN-NOTES.md` (all 7 boards + `ncd.css` read), `DECISIONS.md`,
  this ledger. Inputs copied: the prompt, the PRD, the demo catalogue.
- Catalogue check (HARD STOP 7): valid JSON, version 1.0.0, 26 persons, 0 without `is_synthetic: true`, 110 visits,
  9 day-0 appointments, 8 overdue.
- Baseline before any change: `tsc` app + functions exit 0; `eslint` 0 errors, 2 warnings (pre-existing); Vitest 326 files
  passed, 21 skipped; 8,298 tests passed, 238 skipped (318 s).
- Deviations: D-02 (npm), D-03 (registry person table), D-04 (`ncd_appointment`). Commit type is `feat(ncd)`/`test(ncd)`
  with the phase in the subject, because commitlint allows no `ncd` type (repo wins over `ncd(P<n>)`).
- Incident: `.env.local` was briefly symlinked into the worktree; the first baseline run was stopped during lint, before
  any test ran, and the link removed. No test touched a hosted database.

## P1 — The standard as versioned data · DONE

- Built: `lib/ncdreg/standard/` — `types.ts`, `code-lists.ts` (29 lists + medicine list + LOINC), `conditions.ts` (2 full,
  8 core modules), `calculations.ts`, `classifications.ts`, `validation.ts`, `indicators.ts` (34 definitions),
  `dictionary.ts`, `document.ts`, `generated-docs.ts`; `scripts/ncdreg-docs.ts` (`npm run ncdreg:docs`).
  Generated: `NCDREG-v0.1-DRAFT.md`, `CONDITION-MODULES.md`. Seeded `SIGNOFF-REGISTER.md` (27 items).
- Checks: `tests/ncdreg/standard.test.ts` (module contract via Zod, every item draft, unverified codes, no HIV/dose field,
  34 indicator codes, both documents regenerate identically twice and match disk), `tests/ncdreg/condition-code-search.test.ts`
  (exists, passes), `tests/ncdreg/calculations.test.ts` (eGFR cross-checks 92/99/32/133 exact, every KDIGO, foot, grade
  boundary, care band, status order): 3 files, 81 tests passed.
- **CHECKPOINT 1** passed (continuous mode: no stop).
