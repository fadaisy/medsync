# ADR 0228 — Pharmacy access granted and revoked by a trigger on staff affiliations

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, PA-7, D-PH0-16
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §2.4–§2.6).

## Context

Staff approval is an Edge Function of sequential REST calls, not one transaction, so "grant in the approval's
transaction" cannot live there. Lab Phase 0 solved the same problem with a trigger (ADR 0222).

## Decision

1. `private.sync_pharmacy_access(user, hospital, actor, reason)` keeps one `pharmacy_staff` row in step with an
   approved or active affiliation in a mapped pharmacy cadre at that hospital; it writes an `audit_log` row
   (`table_name 'pharmacy_access'`, event `pharmacy_access_granted` or `pharmacy_access_revoked`) with the basis:
   affiliation, cadre code and name, council, approver, approval time, hospital.
2. An `AFTER INSERT OR DELETE OR UPDATE OF state, cadre_id, hospital_id, user_id` trigger on `staff_affiliations` runs
   it, so approval grants and suspension, deactivation, a cadre change or a move revokes, in that same transaction.
3. A hand-granted row with no basis goes at the user's next affiliation change.
4. `npm run pharmacy:backfill-access` (dry run by default) grants staff approved before migration 0098 through the
   same function, each with the same audit row.

## Consequences

- Every grant and revocation has an audit row; the lab's 0097 trigger runs beside it unchanged.
- Migration 0098 is GATED and owner-applied; the backfill runs after it.

## Alternatives considered

Granting in the Edge Function (not transactional); a nightly sync (access lags approval).
