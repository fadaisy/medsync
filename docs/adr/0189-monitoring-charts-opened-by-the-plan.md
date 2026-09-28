# ADR 0189 — Monitoring charts are opened by the plan

**Status:** Proposed — 2026-09-28. Migration 0089 is GATED. The rule table and graph rules are
`docs/emr/clerking-v2/plan/MONITORING-CHARTS.md` (draft, for CSO review).

## Context

The plan already holds the decisions that need a chart (observations hourly, an IV fluid, insulin). Opening a chart
by hand repeats that decision and can be forgotten.

## Decision

1. **The plan opens the chart.** Placing the plan opens charts through a rule table in pure code
   (`lib/emr/charts/rules.ts`). Each chart records `opened_by`, a pointer to the plan item that opened it, and shows
   it in words.
2. **Only the signed or plainly mechanical rules are on.** Observations (a frequency set in the Plan), fluid balance
   (any IV fluid placed), capillary glucose (glucose monitoring set; insulin, a sulfonylurea, IV glucose or a
   glucose fluid placed), temperature (hypothermia or fever on the problem list, or a core temperature ordered) and
   the MAR (any prescription placed). The rules marked _proposed_ (fluid balance for AKI, sepsis, heart failure or
   DKA; NEWS2 ≥ 1 at clerking) are in the table but **off until the CSO signs them** (owner decision).
3. **Chart day starts at midnight** until a hospital setting exists (owner decision).
4. **Reference lines never flag.** 35 °C and 0.5 mL/kg/h × weight are drawn labelled "to verify"; 4.0 mmol/L cites
   JBDS 2023 from the signed formulary; the NEWS2 bands cite RCP 2017 (`CO-NEWS-01..05`). No value on these charts is
   flagged by MedSync unless a signed rule says so.
5. **Blank is not zero.** A blank cell is "not recorded"; the running balance sums recorded entries only and shows a
   gap marker for an hour without one; urine "not measured" is stated, never 0.
6. **Storage (0089).** `fluid_balance_entries` is append-only (kind `iv_in | oral_in | urine_out | other_out`,
   `volume_ml`, `measured`, `recorded_at`, `recorded_by`, `prescription_id`, `state`), corrected by a new entry that
   names the one it replaces. `monitoring_charts` (encounter, kind, `opened_by` jsonb, frequency, `opened_at`,
   `closed_at`) keeps one open chart per kind per visit. Both have RLS for the clinical reader, write revokes and
   audit triggers. Observations and temperature reuse `clinical_observations`; the MAR reuses
   `medication_administration_records` through its new foreign key (ADR 0186).
7. **Graphs are SVG components** in `components/emr/chart/`, tokens only, `role="img"` with a sentence `aria-label`,
   an empty state in words, the clerking value as an ink dot and nursing entries as teal dots, clock time in Geist
   Mono on the x axis, three or four y ticks, no gridlines beyond reference lines, no animation, and no chart library.
   The maths (running balance, mL/h, drops/min, the weight threshold) lives in pure functions in `lib/emr/charts/`.
8. **The nurse records fluid balance** from the patient's chart in the nurse workspace.

## Consequences

- Neurological observations and drug levels are later rows; not built.
- The 24-hour fluid summary is shown, and goes into a note only on request.

## Alternatives considered

- **Charts opened by the nurse:** duplicates the plan and can be missed.
- **A chart library:** adds weight and motion defaults the design system forbids; SVG is enough for these five views.
