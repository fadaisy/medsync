# ADR 0237 — The numbers ledger

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, E-PH0-05
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §6.1).

## Context

Several branches write migrations and ADRs at once; two have already taken the same ADR number (0073).

## Decision

`docs/NUMBERS.md` records blocks of migration and ADR numbers claimed by work in flight, read across `origin/main` and
every branch. A branch claims its block before its first migration or ADR, and releases what it does not use when it
merges. Pharmacy holds migrations 0098–0117 and ADRs 0227–0241 (0098–0102 and 0227–0237 used).

## Consequences

- Lab Phase 1 and any other new branch start above the claimed blocks.
