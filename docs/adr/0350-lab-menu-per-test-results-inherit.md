# ADR 0350 — The lab menu is per test; results inherit

**Status:** Accepted — 2026-10-19 (TM-D01, TM-D02, TM-D09; signed by Fadhul, CSO). Lab test menu v2.

## Decision

- A hospital sets up **orderable catalogue tests**, never results or LOINC codes (DX-1 restored).
- `diagnostic_offerings` is re-keyed for the lab: `code` is the test id (`test.fbc`), so OM-1's `offering_code` is the
  test itself and the `lab_test_services` link step is gone. Migration 0171 adds `section_override` and
  `stated_turnaround_minutes`; `stated_tat` keeps the words the ordering contract reads.
- The section is `section_override ?? test.section` (`sectionFor`, TM-4); the worklist (LW-3), ordering availability
  and Today use it, mapped to the hub unit by A.3 code (`serology_immunology` ↔ `immunology_serology`).
- One component (`components/lab/test-menu`) serves the hub's Diagnostics → Laboratory and the lab's Set-up → Tests.
  The hospital admin and the laboratory lead edit it; no signing; the audit trigger writes one row per test.
- The laboratory lead sees restricted names; the hospital admin and every other viewer see "Restricted test",
  masked at the read.

## Alternatives considered

- A new `lab_test_offerings` table: a second store for one fact (DX-1). Rejected.
- Keep the LOINC rows and add a mapping: keeps the 27-row FBC. Rejected.
