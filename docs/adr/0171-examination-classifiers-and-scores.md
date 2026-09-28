# ADR 0171 — Examination classifiers and scores: table-driven, reference-bound, shown with their inputs

**Status:** Accepted — 2026-09-28. D-EX-04 to D-EX-09, D-EX-14, D-EX-15, D-EX-20, D-EX-21, SC1–SC4 signed by the CSO.

## Decision

1. **Computed, never typed (E4).** GCS and GCS-P, AMTS, CRB65, ROSIER, GTFCC hydration, Uganda IMAM MUAC, BMI, waist and waist-to-height, distress, acute asthma (SIGN 158), orthostatic hypotension, inter-arm difference, hypoglycaemia level, IWGDF risk, IWGDF/IDSA infection grade and SINBAD are pure functions (`lib/clerking/exam/classifiers.ts`, `scores.ts`) over the answers and the catalogue's reference entries. Only West Haven is the clinician's choice, with a suggestion.
2. **Every result carries its inputs and reason**, shown in a result pill (tone ok / caution / strong, with an icon and words, never red).
3. **Signed references only.** A classifier whose reference is withheld shows "Awaiting sign-off"; a flag whose reference is withheld does not fire.
4. **NEWS2 is the triage engine's.** The examination passes its draft set, ACVPU from consciousness and air or oxygen from General to `scoreNews2`; it never re-implements a band (200 random sets identical).
5. **Edges are tested** at value − ε, value and value + ε for every numeric reference, with a GTFCC truth table and monotonicity properties.

## Consequences

- ACVPU is A only at GCS 15; below 15 the app suggests and the clinician chooses (never inferred).
- ROSIER waits for glucose and for this episode's syncope and seizure; +1 signs count only when confirmed new (SC3).
