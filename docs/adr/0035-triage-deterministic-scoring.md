# ADR 0035 — Triage scoring is a single pure deterministic function

**Status:** Accepted — CLINICAL-SAFETY ARTIFACT, pending CSO sign-off (2026-05-31)
**Context:** The smart triage engine assigns an acuity level that decides who is seen first. It is medico-legally consequential: a clinician, an auditor, or a court must be able to reproduce exactly how any level was reached. Per `prompts/triage-engine-kickoff.md` §0 and the clinical source `docs/clinical/triage-medical-research.md`.

## Decision

Triage scoring is implemented as a **single pure, side-effect-free TypeScript module** (`lib/triage/`), with every clinical threshold a named constant transcribed verbatim from the research doc. The same `TriageInput` always yields the same `TriageResult` — no randomness, no time-dependence, no hidden ML, no network.

### Why one engine, run server-side from a Next.js action (not a Deno edge function)

Every other MedSync write goes through an edge function (ADR 0011). Triage breaks that pattern deliberately: the scoring logic is ~700 lines of clinical rules, and **duplicating it into Deno would create drift between two copies of safety-critical logic** — the worst possible failure mode for a clinical-safety artifact. Instead:

- The engine lives once in `lib/triage`, imported by both the browser (live preview) and the server action (authoritative compute).
- `submitTriageAction` authorises (`requireTriageScope`), runs the **same** `runTriage`, enforces authority, persists, and audits.
- The `triage_records` RLS + row-change trigger are the DB backstop.

The cost (triage writes via server action, not edge function) is accepted; the benefit (one provable source of scoring truth) is non-negotiable for this domain.

### Reproducibility substrate

`triage_records` stores `vitals_snapshot` (exact inputs) + `computed_breakdown` (every parameter's contribution, derived metrics, fired discriminators) + `computed_level` alongside the clinician's `assigned_level`. Anyone can re-run `runTriage(vitals_snapshot)` and get `computed_level` back. The record is the proof.

### Boundary testing as the safety proof

Every NEWS2 band edge is unit-tested on both sides (e.g. RR 24→+2, 25→+3); derived-metric thresholds are tested at the exact cutoff (SI 0.9 = normal, >0.9 = occult shock). 95 boundary tests in GATE B; 154 triage tests total. A threshold typo cannot pass.

## Consequences

**Positive:** reproducible, auditable, testable; no scoring drift; the engine can run client-side for instant transparent feedback because it is pure.
**Negative:** triage writes don't share the edge-function auth/audit harness — so the server action re-implements the authorise→audit envelope (reviewed, mirrors the signup-action precedent).

## Honest scope limit

The research doc fully specifies NEWS2 + derived metrics + the discriminator list, but **not** the full Brighton PEWS per-point sub-rubric or MEOWS per-parameter colour cutoffs. We did **not** fabricate them. Adult patients get full NEWS2; paediatric/obstetric are driven by the life-threat screen + discriminators + derived metrics and marked **provisional** with a "assess against the PEWS/MEOWS chart manually" flag. Those rubrics are a standing CSO data request and slot into Step 2 behind the same pure interface. (See ADR 0036 for the two-track model this composes with.)

## Related

- `lib/triage/` (engine), `tests/triage/` (boundary tests)
- `docs/clinical/triage-medical-research.md` (the authoritative thresholds)
- ADR 0011 (edge-functions-for-writes — the pattern this consciously departs from)
- ADR 0036 (two-track worse-of model), ADR 0037 (override + authority)
