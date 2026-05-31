# ADR 0037 — Triage is clinician-overridable; down-triage is cadre-gated

**Status:** Accepted — CLINICAL-SAFETY ARTIFACT, pending CSO sign-off (2026-05-31)
**Context:** The engine advises; a human decides. But not every clinician should be able to move a patient to a _lower_ acuity than computed — that is exactly where under-triage harm occurs. Per kickoff §0.3 / §3 and ratified decision R1.

## Decision

### Every triage output is overridable, with a logged reason

The clinician confirms or overrides the computed level up or down. The record stores both `computed_level` and `assigned_level` plus `override_direction` — a rich audit + the seed of the over/under-triage validation dataset (ADR 0035 §honest-scope, research §10).

### Down-triage is gated by cadre (R1)

- **Triage at all** (`triage_patient`): every clinical cadre (nurse, midwife, specialist nurse, all doctor grades, clinical officer). Reception and other non-clinical cadres: never (no policy row → blocked, AND `triage_records` RLS requires `cadres.is_clinical = true`).
- **Down-triage** (`triage_downgrade` — assign _less_ acute than computed): **doctors and clinical officers only.** Nurses may triage and escalate freely but may not reduce a computed acuity.

This rides the existing `clinical_cosign_policies` mechanism (ADR 0027/0030): two new `action_kind`s seeded per hospital. No bespoke authority table. The pure resolver `resolveTriageAuthority` (16 boundary tests) decides; the server action enforces; a DB CHECK requires a reason on any down-override.

### Enforcement is defence-in-depth

1. UI: down-triage buttons disabled for cadres without authority.
2. Server action: `canAssignLevel` rejects an unauthorised or reasonless down-assignment.
3. DB: `tr_override_reason_required` CHECK + `triage_records` RLS (`is_clinical = true`).

A bug in any one layer is caught by the next.

## Consequences

**Positive:** the high-stakes action (downgrade) is restricted to the most-qualified cadres, reasoned, and audited; the safe action (escalate) stays frictionless for all clinicians; reception is excluded at three layers.
**Negative:** a nurse who believes a computed level is too high must escalate to a doctor to lower it — accepted as the safer default (R1 was an explicit CSO ruling; revisitable per hospital via the policy table without code change).

## Related

- ADR 0027 / 0030 (cadre-capability mapping — the mechanism reused)
- ADR 0035 (deterministic scoring), ADR 0036 (two-track model)
- `lib/triage/authority.ts`, `tests/triage/authority.test.ts`, migration 0036 (policy seed)
