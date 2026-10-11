# ADR 0222 — The database keeps the lab role in step with the affiliation

**Status:** Accepted — 2026-10-10, Lab Phase 0 GATE A, D-LAB0-18 and D-LAB0-12. Migration 0097 (owner-applied).

## Context

Law 2 of the Lab Phase 0 prompt: a lab permission is granted inside the transaction of the approval that justifies
it, and revoked inside the transaction that ends it, audited each time. The approval Edge Function makes sequential
REST calls with no transaction, and suspension, deactivation and reactivation live in other functions.

## Decision

1. `private.sync_lab_access(user, hospital, actor, reason)`: the user holds `lab_tech` at a hospital exactly when
   they have an approved or active affiliation there with a lab cadre. It inserts or deletes the one row and writes
   an `audit_log` row (`table_name = 'lab_access'`) with the basis: affiliation, cadre, council, approver, approval
   time, hospital. Idempotent.
2. A trigger on `staff_affiliations` (insert, delete, update of state, cadre, hospital or user) runs it for the old
   and new (user, hospital). A trigger runs in the transaction that changed the affiliation, so every path — today's
   functions and any future one — grants and revokes atomically.
3. `scripts/lab/backfill-lab-access.ts` (`npm run lab:backfill-access`) lists staff approved before 0097 (dry run by
   default) and grants through the same function.

## Consequences

- No Edge Function changed. `assign-role` behaves as before, but a hand-granted `lab_tech` with no lab affiliation
  is removed at the next change to that person's affiliation (the council register is the only source).
- A revocation under the service role records no actor on its `lab_access` row; the actor is on the `sa_audit_log`
  row the status function writes before it changes the affiliation.
- Proven on the PGlite lane: `tests/emr-db/lab-access.test.ts` (14 probes).

## Alternatives considered

Granting in each Edge Function (no transaction, and every new path must remember); an RPC wrapping approval (changes
every approval, still misses suspension paths).
