# ADR 0355 — `loinc_codes` is a code reference only

**Status:** Accepted — 2026-10-19 (Law 1, Step 10).

## Decision

- `loinc_codes` stays as a code reference (a table comment in 0171). No menu, hub list or offering reads it.
- The hub's `upsert_offerings` refuses lab rows; availability problems name catalogue tests. The old
  `?test=<LOINC>` Diagnostics URL redirects to the menu, keeping its other filters.
- Per-LOINC settings move to tests by `npm run lab:migrate-offerings` (TM-9, dry run first, report in
  `docs/lab/test-menu-v2/migration-report.md`); the old rows stay, unread. `tests/lab/test-menu-hardening.test.ts`
  (S26) fails if a writer keys an offering by LOINC.
