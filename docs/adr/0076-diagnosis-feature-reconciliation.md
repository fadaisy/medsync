# ADR-0076 — NCD catalog surfaced + diagnosis-driven feature reconciliation

**Status:** Accepted (CSO-directed, 2026-06-16). Built on `feat/diagnosis-reconciliation`. Extends [ADR-0075](docs/adr/0075-ncd-diagnosis-catalog.md) (NCD catalog) + [ADR-0074](docs/adr/0074-assessment-as-diagnostic-logic.md). **No migration.**

**Context:** The NCD catalog (0075) shipped gated dark, so the diabetes types + the 15 NCDs weren't visible. The CSO directed: make the catalog vaster/visible (surface the types) and add a feature where **selecting a diagnosis scans the whole clerkship for its supporting features, auto-confirms those already captured, and leaves the missing ones blank for the clinician to capture** (e.g. diabetes' polyuria/polydipsia/etc.).

## Decision

1. **Surface the NCD catalog.** `NCD_CATALOG_CSO_SIGNED = true` — the NCD entries (incl. `Type 1` / `Type 2` / `diabetes with complications`) are now live in the ranked suggestions + the catalog picker. **Per-criterion honesty is preserved:** each defining criterion still carries its confidence, and the 17 `needs_cso_input` thresholds remain flagged in-UI. Criteria **inform + display**, never auto-diagnose; selecting an NCD is the clinician's act and only adds it to the differential. ICD-10 still only from verified codes; one-source-of-truth with the reasoning maps unchanged (the NCD catalog is still a parallel layer).
2. **Diagnosis-driven feature reconciliation.** `lib/clerkship/diagnosis/reconcile.ts` (pure/TDD): `expectedFeaturesFor(display)` resolves a diagnosis's supports from either catalog (NCD `supportingSymptoms`/`riskFactors` or the acute `supportingSymptoms[].symptom`/`riskFactors`); `reconcileFeatures(expected, captured)` marks each present (its code is in the captured clerkship) or missing.
3. **The reconciliation surface** (`diagnosis-reconciliation.tsx`): for each SELECTED working diagnosis, a checklist — present features shown ✓ (auto-confirmed from what was captured), missing features shown as a dashed ＋ chip. **Tapping a missing symptom captures it** as a present ROS observation (`onCaptureSymptom → setRos`, deduped — never overwrites an existing row). **No fabrication:** a missing feature stays missing until the clinician taps it; nothing is auto-filled. Code→display+system is resolved from the live catalogs (`loadRosCatalog`/`loadSymptomCatalog`/`loadClerkshipPicklists`); capture is disabled for any code without catalog metadata.

## Consequences

- The doctor can now select a diagnosis (suggestion or picker) and immediately see + complete its expected supporting history — targeted, efficient, honest.
- Risk factors are shown present/missing but captured in Background (not tap-captured here in this pass).
- **Pre-deploy adversarial review** (no-fabrication / capture-correctness / live-NCD-safety lenses) before deploy.
- **Open follow-ups (carried from 0075):** the GATE-A "added features" (retinopathy grading, urine dipstick, hypertensive-LVH, risk tokens + height/weight vital); risk-factor tap-capture into PMH; auto-evaluating measured criteria against results; diabetes T1-vs-T2 classification. The 17 `needs_cso_input` NCD criteria still want CSO ratification (now surfaced with markers rather than hidden).
