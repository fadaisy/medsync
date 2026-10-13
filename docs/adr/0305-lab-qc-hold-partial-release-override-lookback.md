# ADR 0305 — Holding release on failed QC: partial release, the override and the look-back

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

A result released from an analyser whose QC has failed may be acted on (hazard 1). Release in MedSync is per report,
not per component (STOP 0), and a report has no "partial" status.

## Decision

1. **The hold** (D-LAB3-01, QH-2): with `labQcHold` on, `writeReportVersion` calls `qcGate` for every `final` lab
   version made on an analyser, so every release path (release, final entry, critical mark, downtime) is covered. A
   component whose latest run is rejected is held; the others release.
2. **Partial release** (E-LAB3-08): held components are written `preliminary` inside the `final` report and listed in
   `diagnostic_reports.qc_held`; the doctor reads "{Analyte} to follow: held for quality control." Releasing them later
   writes a **completion version** (`final` after `final`, held components only, no correction alert). An amendment
   refuses a held value.
3. **QC not run** informs by default ("QC not run today", recorded on the result); the lead may set "hold" per plan
   (D-LAB3-02).
4. **The override** is the release action itself (`qcOverride` on release), so no second write path can skip the hold:
   it needs `lab.qc.override` (from headship) and a reason, marks the observation, carries "Released while QC had
   failed. The lab is reviewing this result." to the doctor, joins the look-back and is audited.
5. **The look-back** (`lab_lookback_items`, D-LAB3-08): results released on that analyser from the last accepted run
   to the rejected run, plus overrides; each gets one decision (Result stands, Repeat when QC passes, Amend through the
   Phase 1 amendment), set once. The bias estimate is labelled "estimate" and only sorts the list. "Repeat when QC
   passes" becomes a task above the worklist once QC is no longer failed.
6. The status at release is snapshotted per component (QH-6). "Run on another analyser" names analysers that passed
   today for Immediate orders.

## Consequences

Moving a specimen to another analyser's profile ("re-pinning", QH-5) is not built: the hold block names the analysers,
the technologist runs the sample there through the usual path. A one-analyser lab at night needs an override holder
on shift.
