# ADR 0333 — Delta checks run at save and hold an in-house release until each flag is decided

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

A big change from the patient's previous result is the commonest sign of a wrong-patient sample (CLSI EP33). A warning that can be clicked through is ignored.

## Decision

1. A `delta_rule` (absolute, percent, rate, or RCV = √2·Z·√(CVA²+CVI²), with a log-normal form) runs only when a laboratory lead has signed it with its basis and source and the CSO has countersigned. MedSync proposes no limit; the calculator is arithmetic only.
2. Rules evaluate in `writeReportVersion` behind `LAB_DELTA_CHECKS`, with the rules in force at write time and the history at specimen time. Panel and pattern rules inform the same way.
3. An in-house lab release is disabled until every fired flag has an outcome with a note; "recollect" rejects the specimen as a possible wrong sample, "mislabel confirmed" opens a nonconformity. The panel always says "Check the previous specimen too".
4. Each rule shows its flag rate over 30 days and is marked "Flags often · review" when it fires too often (DL-8).

## Consequences

Lane `lab-delta` S1 to S10. Referred and bedside results are flagged but not gated (ADR 0334).
