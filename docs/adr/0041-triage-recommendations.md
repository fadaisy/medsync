# ADR 0041 — Triage recommendations are decision-support suggestions, never orders

**Status:** Accepted — CLINICAL-SAFETY artifact (CSO authorised the GATE-A mapping + defaults, 2026-06-01)
**Context:** The triage engine (ADR 0035–0040) produces an acuity + reasoning. The recommendations addendum adds a layer that turns that finding into **general, guideline-derived suggested next actions** — disposition, immediate measures, monitoring frequency, escalation, pathway flags, onward routing, investigations. The risk being managed: a suggestion layer in a clinical tool must never become an order, never prescribe, and never hide what it can't actually do.

## Decision

A pure mapping `lib/triage/recommend.ts` (`recommend(result, assignedLevel)`) produces `Recommendation[]` from a `TriageResult`. The governing rules, all enforced:

1. **Suggestions, not orders.** Each recommendation renders with an **accept / modify / dismiss** control (`app/nurse/triage/_components/next-steps.tsx`). Accepting records _intent_ only — nothing auto-executes. The clinician's decisions are stored with the triage record.
2. **Category-level only — no dosing.** Suggestions name categories of action ("supplemental oxygen titrated to target", "IV access + bloods", "sepsis pathway", "12-lead ECG"). They never specify drug doses, fluid volumes, or definitive treatment. A unit test (`tests/triage/recommend.test.ts`) runs a forbidden-token regex (`\d+ mg/ml/mmol/units`, `mg/kg`, `30 ml`, named agents like magnesium sulfate / labetalol / tranexamic / glucagon) across the suggestion strings of a broad scenario set and fails the build on any match.
3. **Guideline-derived + transparent.** Every recommendation carries a non-empty `source` citation (NEWS2/RCP 2017, ESI v5/ENA 2023, Sepsis-3/SSC, SATS, AHA/ASA, NICE, JBDS). If a finding has no traceable basis, no recommendation is produced — nothing is fabricated.
4. **Bias to over-escalation; never under.** The **down-disposition gate**: an L4/L5 finding is held at the standard area (never down-streamed to fast-track/virtual) while `incompleteVitals || provisional || a discriminator fired`.
5. **Recompute on override.** `recommend(result, assignedLevel)` takes the clinician's final level, so suggestions follow the assigned call, not the superseded computed one. The panel passes the live `effectiveAssigned`.
6. **Honest seams.** `seam: 'live'` only where a built surface exists — the care-team notification (`notifyTriageOutcome`, ALERT_LEVELS 1–2) and urgent-appointment creation. Everything else is `seam: 'pending_intent'`, shown as "workflow to follow" — recorded, never silently dropped. The care-team notification is disclosed as a department-wide in-app broadcast (SMS/push stubbed), so high-acuity routing suggestions also prompt an in-person hand-off.
7. **Provisional populations not fabricated.** Paediatric (PEWS) and obstetric (MEOWS) recommendations carry `confidence: 'needs_cso_input'`, route up to the specialty area, and require a manual chart before any down-disposition — their per-point rubrics are not encoded.

## Storage

No migration. Decisions persist in the existing `triage_records.computed_breakdown` jsonb (`recommendationDecisions: [{code, category, decision, note}]`), captured by `submitTriageAction` and validated by its zod schema (max 40, decision ∈ pending/accepted/modified/dismissed). The dedicated `triage_recommendations` table proposed in GATE A (`docs/triage-recommendations-gate-a.md`) is deferred to a later build; the jsonb trail is sufficient for QI + the medico-legal record now.

## Consequences

**Positive:** the clinician sees, beside the acuity, what the guidelines suggest doing next — each with its why + source — and owns every decision; the trail feeds QI + recommendation-adherence validation; the order/protocol-execution workflows have a clean seam (pending intents recorded).
**Negative:** suggestions are advisory only and the named pathways/timers don't execute yet (by design); paeds/obstetric stay provisional. The `recommend` mapping is a clinical-safety surface — changes require CSO authorship, like the engine constants.

## Related

- `docs/triage-recommendations-gate-a.md` (the signed mapping), `lib/triage/recommend.ts`, `tests/triage/recommend.test.ts`, `app/nurse/triage/_components/next-steps.tsx`
- ADR 0035–0040 (the triage engine + ESI-v5 + rapid mode)
