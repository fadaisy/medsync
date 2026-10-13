# ADR 0303 — Equipment on the `devices` record; breakdowns through the hub's own action

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

The prompt asked to extend the hub's machine record. The hub has none (STOP 0, H5): it keeps an imaging machine
count and availability problems, written only by the edge function `ha-services-hub`. Bedside meters already live in
`devices`.

## Decision

1. **One machine table** (E-LAB3-09, `0113_lab_equipment.sql`): `devices` gains twelve lab equipment kinds, states
   `down` and `blocked`, section, service details, linked components and tests, and schedules (maintenance tasks,
   calibration items and a temperature range, all operational, set by the lead). `analyser_profiles.device_id` links a
   profile to its analyser.
2. **One append-only log** (`lab_equipment_logs`): maintenance, calibration, temperature, repair, error and drop.
   `lab_breakdowns` holds one open breakdown per device, closed once.
3. **Down writes the hub's own state** (Law 2): marking a machine down reports `report_problem` (subject test, state
   unavailable, reason `equipment_down`) through `callEdge("ha-services-hub", …)` for every test whose only
   in-service machine it is, so ordering shows "Analyser down" in the same request (EQ-2). If a later step fails, the
   reported problems are resolved again.
4. **Back in service** needs a repair after the breakdown and an accepted QC run after the repair for every linked
   component (EQ-3); only then are the hub problems resolved and the breakdown closed with its downtime.
5. A temperature out of range opens a nonconformity, notifies the lead and suggests quarantine of the lots stored
   there; it never quarantines by itself (D-LAB3-12, EQ-6). Missing readings are listed.
6. Behind `labEquipment` (`LAB_EQUIPMENT`), `/lab/equipment`.

## Consequences

Marking down needs a department head (the hub's own check). Kit and stain QC after a repair is not yet linked to a
machine (no linked kit items on `devices`). Records are reference text, not uploads.
