# ADR 0243 — The recipient ladder and critical-results contacts, in the absence of a roster

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-07, D-LAB1-05). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

MedSync has no duty rota. An alert must still reach someone who can act, and the lab must know when it cannot.

## Decision

1. Three levels, resolved when the alert reaches each one and stored (RC-6):
   - level 0: the ordering clinician, and the open encounter's clinician if different (RC-1);
   - level 1: the ordering department's critical-results contacts in order, or by default its head (RC-2);
   - level 2: the hospital's critical-results contacts (RC-3).
2. Deactivated, departed or unknown staff, and for a restricted report anyone without an access basis, are skipped and
   listed (RC-4).
3. A level that resolves to nobody is named on the timeline and passed at once. If every level is empty the alert is
   "Not sent" at the last level and the lab is told, in words, to phone the ward (RC-5, S4, S5).
4. Contacts are set by the laboratory lead in "Response and contacts". In production `LAB_CRITICALS` refuses to turn on
   while a department with an encounter in the last 30 days has no level-1 contact (S19).
5. The informed nurse in charge is not built: no nurse notification surface exists (RC-7, D-LAB1-05).

## Consequences

The ladder is only as good as the contacts. That is hazard 3 (medium) and hazard 2 (medium).
