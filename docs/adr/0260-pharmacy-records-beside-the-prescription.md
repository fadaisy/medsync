# ADR 0260 — Pharmacy records are events beside the prescription

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), E-PH1-01, Law 2.

## Decision

1. Everything the pharmacy does to a prescription line is an append-only event in its own tables (`pharmacy_line_events`,
   `pharmacy_queries`/`_events`, `pharmacy_supplies`, `pharmacy_handovers` and the rest, migrations 0122–0130). Stages and
   outcomes are projections over those events (`lib/pharmacy/lines.ts`).
2. No pharmacy action writes to `prescriptions`. A dose, route, frequency, duration or medicine changes only through the
   prescriber's own actions. A test enumerates every pharmacy action and proves it (Law 2).
3. A line version is the prescription row (owner's answer at STOP 0, ADR 0278).
4. Event tables refuse UPDATE and DELETE for every role through `public.block_modify_append_only()`, the service role
   included; a correction is a new event naming the one it corrects.

## Consequences

- The pharmacy can always say what it did and when, and nothing it records can change what the prescriber wrote.
- Projections must be rebuilt from events; any cached figure is tested against them.

## Alternatives considered

- Columns on `prescriptions` for pharmacy state: rejected; it would let the pharmacy write the prescription.
