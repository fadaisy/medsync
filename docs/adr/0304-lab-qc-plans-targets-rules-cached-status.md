# ADR 0304 — QC plans as signed configuration, provisional to lab targets, the rule library and the cached status

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Quantitative QC (two levels a day, Westgard rules, a Levey-Jennings chart) was kept on paper, if at all. Release had
no way to know whether QC had passed.

## Decision

1. **Plans** are signed configuration (`lab_signed_configs` kind `qc_plan`, key = analyser:component), signed by the
   laboratory lead and countersigned by the CSO: levels and control material, frequency, reject and warn rules, whether
   "not run" holds, and the targets per control lot. A hospital-wide `qc_policy` (lead + CSO) holds the minimum runs
   and span for a lab's own target, with sources (WHO LQMS, CLSI C24 Ed4). No target, SD or minimum ships in code.
2. **Targets** start from the maker's range, marked provisional, until the signed minimum of accepted runs over the
   signed minimum span; the lab's own target is set only by the explicit **Set this lab's target**, which creates a new
   plan version. There is no rolling recalculation (QQ-3, hazard 5).
3. **The rule library** is a pure evaluator in SD units (`lib/lab/qc-rules.ts`, E-LAB3-03): 1-3s, 2-2s, R-4s (within
   run), 4-1s, 10-x reject; 1-2s warns and is never a gate (D-LAB3-03). History resets on a control lot change or a
   new plan version (QR-3).
4. **One append-only row per run** (`lab_qc_runs`: values, breaks, decision). The screen previews the decision; the
   server evaluates again and refuses a different answer, so the person confirms what the chart decided.
5. **A cached status per analyser and component** (`lab_qc_status`, E-LAB3-04), updated with each run, so release reads
   one row per component (`qcStatusFor`, one query for every component).
6. Behind `labQc` (`LAB_QC`, needs `labStock` and units): `/lab/quality`, `/lab/quality/qc`, `/lab/quality/qc/run`.

## Consequences

Rules have finite power; QC can miss an error. A plan with too little history cannot fire across-run rules early in a
lot. Sigma-based rule selection is later work.
