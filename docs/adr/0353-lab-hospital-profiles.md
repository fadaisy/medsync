# ADR 0353 — Hospital profiles

**Status:** Accepted — 2026-10-19 (TM-10, TM-D07).

## Decision

- `lab_order_profiles` (0171): hospital, name, note, ordered `test_codes`, active. One table: the list is short and
  ordered.
- A profile holds only offered menu tests; its name may not name a restricted condition (`restrictedNames`, draft).
- On the order sheet a profile adds one line per test; each line keeps its own section, payment, class and
  availability snapshot. A test taken off the menu flags its profiles; nothing changes them silently.
