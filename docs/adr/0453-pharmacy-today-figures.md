# ADR 0453 — Pharmacy Today: figures as read models

**Status:** Proposed — 27 Oct 2026. The definitions need the CSO signature (GATE A §6).

## Decision

Today's figures are pure projections (`lib/pharmacy/workspace-v2/today.ts`) over existing rows:

- the review queue's stages and oldest waits;
- arrivals per hour (`prescriptions.created_at`) and hand-overs per hour (`pharmacy_handovers.supplied_at`);
- seven local days of bars for supplied, not on the shelf, vital out, look-back and controlled differences.

No target is invented: "late" is the queue's own rule. Refills have no history, so they show "No earlier data". There is no realtime channel, so the page says "As of {time}".
