# ADR 0156 — The test menu is an overlay on the ordering catalogue

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Clinicians order from `loinc_codes`. A hospital needs to say which of those tests it runs in-house, which it refers out and to where, its hours, and a stated turnaround. The national (CPHL) test menu was to be the comparison baseline, but its published URL was unavailable when checked (TLS mismatch on www, 404 on the bare host).

## Decision

- **`diagnostic_offerings`** is keyed by (hospital, kind, code).
  - Lab codes are validated against `loinc_codes` in the function.
  - Imaging codes come from catalogue A.4.
  - Other fields: provision (in-house, referred, not offered), lab section, hours, stated turnaround (operational, never a clinical target), `referred_to`, machines.
- `confirmed_at` is null for Planned rows (from a preset or the legacy import), and those rows are not orderable.
- **The comparison with the national menu waits for the Ministry's list.** The Diagnostics tab says so plainly, and presets exclude tests (D-SVC-03 Δ).

## Consequences

- The EMR's per-hospital test rows read these offerings by code (ADR 0151).
- Importing the national menu is a data task that needs no schema change.
