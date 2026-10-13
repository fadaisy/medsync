# ADR 0311 — Quality indicators: definitions, "No data", and aggregate-only access

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

The laboratory and the hospital need turnaround, rejection, critical-result and QC indicators. A drill-down must show
records to lab roles only, and an empty source must never read as a good 0 % (hazard 28).

## Decision

1. **One SQL definition** of what each indicator counts (`0118_lab_indicators.sql`,
   `private.lab_indicator_source`, never granted), read two ways: `lab_indicator_rows` returns the source rows to lab
   readers only; `lab_indicator_counts` returns numbers only (no id, no patient, no event time) to the lab, the
   In-Charge, the focal person and the hospital admin (QI-4, Law 10).
2. **Computed at read time** for any month or range, closed months included, with the as-of time (QI-3). No month
   cache (P13).
3. **"No data"** for a zero denominator or no source rows, never 0 % (QI-2).
4. Downtime results keep the paper's times for turnaround (DT-7); the lab's stated turnaround is the hub's when it is
   one figure, otherwise none.
5. `/lab/reports` (eight tiles, turnaround p90 per section, rejections by reason with the ward most affected, CSV) and
   `/lab/reports/records`; a **Laboratory** section on `/hospital-admin/reports` with the same tiles over the admin's
   window and no links. Behind `labReports` (`LAB_REPORTS`).

## Consequences

Four indicators (no IQC, no EQA, unacceptable EQA, stock-out days) are shown where their facts live (EQA and stock
pages), not on the report page. The In-Charge and focal person may call the counts function but have no screen of
their own yet.
