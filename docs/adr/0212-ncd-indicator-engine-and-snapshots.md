# ADR 0212 — Indicators as pure functions over one dataset, with immutable signed monthly snapshots

**Status:** Proposed — 2026-10-05. NCDSync build (§6, F5).

## Decision

1. The indicator engine is a pure function of a facility dataset, a reporting month and an as-of date. The dataset is
   loaded in one transaction under `medsync_ncd_analytics`, which is granted no identifier column. HEARTS360 windows are
   calendar months in the facility time zone; live views use the same rule with as-of = today (D-05, D-06).
2. C- and H-definitions name their modules in the standard; the G-family runs over the module records, so the engine
   names no condition.
3. A monthly snapshot stores the results without person ids. A snapshot computed from any synthetic person is marked
   synthetic. Signing needs an approved facility with no demo data on; a signed snapshot is immutable by trigger, and
   later corrections appear in the next period.
4. A golden dataset of 69 hand-designed patients, with hand-written expectations naming the patients behind every
   number, gates every change to the engine.

## Consequences

- One implementation serves the dashboard, drill-down, recall figures, reports, exports and calibration.
- The dashboard's 12-month trend reruns the engine per month over the same loaded dataset.
