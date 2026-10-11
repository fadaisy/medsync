# ADR 0241 — Reference ranges: a signed store, a resolver by sex and age, and snapshots

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-09, D-LAB1-11, D-LAB1-21, D-LAB1-22). Built on `feat/lab-safety-floor` behind `LAB_UNITS_RANGES`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Results carried no reference range and no flag, or a range typed by hand. A range applied to the wrong sex or age is a
quiet error.

## Decision

1. `reference_range_versions` and `reference_range_bands` (migration 0104), per hospital and test component: bands by
   sex and age in days (years converted at 365.25 days). A version is used only when signed by the laboratory lead and
   the CSO, two different people (S24).
2. The resolver (`lib/lab/ranges.ts`, RR-1 to RR-8) picks the band for the patient's sex and age at collection. An adult
   band never applies to a child; no band means no range, said in words. Where no signed set covers the test yet, the
   technologist types the range as today and it is kept marked unsigned (D-LAB1-09). A patient without a recorded sex
   or date of birth gets only bands that need neither (D-LAB1-22).
3. The flag (`lib/lab/flags.ts`, FL-1 to FL-7) is computed from the band. A technologist may change it with a reason; the
   computed flag, the chosen flag and the reason are all kept (S27).
4. The band, its version and the flags are written into the snapshot at release and never change afterwards (S25).
5. Pregnancy-specific ranges are out of scope (D-LAB1-21; hazard 23, open).

## Consequences

- Range resolution is one query per report, not one per component.
- No range has fired that both signers have not signed. The values themselves come from the hospital, through set-up.
