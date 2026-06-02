# ADR 0046 — Resus team mobilisation: in-app real now, SMS/push stubbed, on-shift deferred

**Status:** Accepted — CSO authorised the GATE-A roster (2026-06-02)
**Context:** Opening a resus must summon the team to converge (recognition → call for help → response, ERC 2025) and give every responder a shared live view of who's coming and what's happening. The honest constraint: MedSync has in-app notifications (`sa_notifications`) but **no SMS/push dispatcher** and **no on-shift/on-duty presence model** yet.

## Decision

1. **Reuse the triage notification pattern** (`lib/resus/mobilise.ts` mirrors `lib/triage/notify.ts`). On open, write one in-app `sa_notifications` row (`kind='clinical_resus_mobilisation'`, migration 0038) per recipient — **real today**. SMS/push ride the existing stubbed `NotificationSink` (logs intent; one-file swap when a gateway lands).
2. **Roster v1 = all active clinical staff at the receiving department + the active ward-in-charge(s).** Because no on-shift model exists, this is the honest net (proposal §D.1); narrowing to on-duty staff is a later refinement, flagged.
3. **The shared "who's responding" substrate** is `resus_mobilisation_alerts` (one row per call, linking the `sa_notification`); a responder marks themselves responding (`acknowledgeResusAlert`), and the desk shows the roster + responder count, refreshed live.
4. **Roles never block.** `resus_role_assignments` records who holds each role over time (open = current; a hand-over closes the prior row). Assignment is open to any responder under pressure; `leader` is _recommended_ for a doctor/clinical-officer cadre (soft hint), never hard-gated (proposal §D.2).
5. **Never throws.** A failed alert must not roll back the resus episode — the record is the source of truth; the alert is a courtesy.

## Consequences

**Positive:** opening a resus immediately broadcasts in-app + records the call, and the converging team orients from a shared view; the SMS/push seam is honest and swap-ready; roles never obstruct a team moving fast. **Negative:** out-of-band delivery is not real yet (stubbed, disclosed); the roster is department-wide (no on-shift filter) so it may over-notify until a presence model exists.

## Related

- `lib/resus/mobilise.ts`, `lib/resus/record.ts` (roster/responders), `db/schema/resus.ts`, migration 0038
- ADR 0041 / `lib/triage/notify.ts` (the reused pattern); `docs/resus-abcde-gate-a-proposal.md` §D
