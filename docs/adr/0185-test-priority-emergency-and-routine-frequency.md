# ADR 0185 — Test priority gains Emergency; a routine test needs a frequency

**Status:** Proposed — 2026-09-28. Migration 0087 is GATED and applied by the owner. The priority definitions are
proposed wording; each lab sets its own times.

## Context

Test priorities are `routine | urgent | immediate` (`enc_order_priority_check`, migration 0071). The Plan needs a
priority for a life-threatening request that is collected at the bedside and phoned through, and a routine test on
an admitted patient is usually repeated (daily U&E, 6-hourly glucose); today nothing records how often.

## Decision

1. **Priorities:** routine | urgent | immediate | **emergency**. Emergency is the only priority drawn in the critical
   token, always with its word. The one-line definitions under the control are proposed wording, shown as such:
   - Routine: "Collected on the next round; resulted in the lab's routine time."
   - Urgent: "Collected and processed ahead of routine work."
   - Immediate: "Collected now; the lab processes it as soon as it arrives."
   - Emergency: "Life-threatening: collected at the bedside now, result phoned through."
2. **Frequency:** `encounter_orders.frequency` in `once | daily | 12h | 6h`. A routine order needs one; other
   priorities may carry one or none.
3. **Enforced on insert, not by CHECK.** A BEFORE INSERT trigger refuses a routine order with no frequency. A CHECK
   would also bind every later status update of the routine rows already stored without one.
4. **Every routine line carries a frequency.** The Plan sends the one chosen. The write path (`orderFrequencyFor`)
   gives a routine line with none `once`, so the order sheet, Impression's "Add to plan", the triage suggestion and
   the resus handover (routine lines) keep working unchanged; the database trigger backs it up.

## Consequences

- Migration 0087 must be applied before the flag that exposes Emergency and the frequency is turned on; until then
  the Plan stays off and the write path sends neither column.
- Result turnaround targets per priority remain the lab's, not MedSync's.

## Alternatives considered

- **Reuse Immediate for emergencies:** loses the distinction the wards asked for between "now" and "life-threatening".
- **A CHECK constraint** `priority <> 'routine' OR frequency IS NOT NULL`: breaks updates to the existing rows.
