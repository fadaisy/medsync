# ADR 0249 — The cut-over to one result path

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-24, D-LAB1-25). Built on `feat/lab-safety-floor` behind the switch itself (per hospital); migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Two result paths run side by side: the legacy encounter results (Phase 0's `/lab` list, `app/lab/actions.ts`) and the
EMR reports. Two paths mean two places to look, and the legacy path has none of this phase's controls (F9; hazards 20
and 24).

## Decision

1. Four conditions, read from the record with their evidence (CO-1, `lib/lab/cutover.ts`):
   - no open legacy item (an old-path order still ordered or collected);
   - set-up complete (a unit for every test in use, the flagging notice and the alert wording signed, response times
     signed, a level-1 contact for every live department);
   - a downtime drill recorded;
   - a briefing of the lab and the wards recorded.
2. A hospital admin requests the switch when all four hold. A **different** hospital admin approves it, which rereads
   the conditions and switches in one audited transaction (CO-2). The database refuses the same person (CHECK).
3. After the switch the three legacy write actions (enter, release, reject) refuse for that hospital, each asking
   `legacyWritesOpen` first: "This hospital uses one result path now…" (CO-4). The legacy results stay readable, as typed,
   under "Older results" (`/lab/older`).
4. Reversal is a superadmin's request with a reason (10 characters or more) and a second, different superadmin's
   approval, in `/admin/lab-signoffs` (CO-5).
5. One live switch row per hospital (a partial unique index).

## Consequences

- No legacy write is callable after the switch (S47, F9 fixed).
- No hospital can switch until the CSO signs the Appendix A wording.
- The legacy decimal-comma risk ("7,2" → 72) ends at the switch.
