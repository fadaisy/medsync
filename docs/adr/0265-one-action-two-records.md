# ADR 0265 — One action, two records: the hand-over transaction

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), Law 3, SU-1 to SU-3, SU-10, E-PH1-03.

## Decision

1. A hand-over writes, in one transaction, one supply row and one `supplied` movement per batch, the outcome event per
   line, and the hand-over record.
2. Law 3 is checked by the database at COMMIT: a deferred constraint trigger on both tables requires exactly one matching
   `supplied` movement (same batch, point and quantity) per supply, and a supply for every `supplied` movement
   (migration 0126). A transaction that leaves either alone does not commit.
3. Each writer takes a transaction-scoped advisory lock per line (`pharmacy-line:<prescription id>`) and re-checks the
   line's outcome under it, so two points cannot hand over one line twice; the batch row lock decides overdraws.
4. First expiry first out is proposed; any other batch needs a coded reason. Nothing is held for a "ready" or owed line.
5. A repeated client key returns the existing hand-over.

## Consequences

- Proven sequentially on the PGlite lane and with two real connections by `tests/rls/pharmacy-races.test.ts`
  (owner-run against the dev database).

## Alternatives considered

- Application-only checks: rejected; a bug or a second writer could break Law 3 silently.
