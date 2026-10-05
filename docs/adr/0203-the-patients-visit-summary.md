# ADR 0203 — The patient's visit summary

**Status:** Proposed — 2026-10-03. Behind `PATIENT_VISIT_SUMMARY` (per hospital).

## Context

Nothing a hospital records reaches the patient. The owner decided (D3) that the doctor reviews a patient-facing
copy at the close and shares or holds it.

## Decision

1. **One composer** (`lib/patient/visit-summary.ts`, pure): the visit (date, hospital, clinician and cadre, outcome in
   plain words), what we found (this visit's confirmed and leading diagnoses; differentials and refuted never),
   medicines (take home, as prescribed; stopped), tests ordered (names; "results will be shared after your clinician
   reviews them"), next (the booked follow-up or review date; come back if: the clinician's own words), and for an
   admission the ward and the bed or "waiting for a bed".
2. **Restricted never reaches it.** Every item carries its `sensitivity`; the composer drops `restricted` first
   (property-tested). The doctor may remove more items, by id; never add one back.
3. **Words are the clinical term or the clinician's own.** No lay names or advice sets are CSO-signed; none ship.
4. **`patient_visit_summaries`**, append-only and versioned: each row is a decision, `shared` (with the encrypted
   snapshot) or `held` (with a reason: tell in person first, waiting for a result, patient asked not to, other). A
   later share or a correction is a new version that supersedes; the patient sees "Updated". Written in the
   clinician's transaction (`withPatientWrite`, the EMR's write path), row-audited.
5. **Who reads:** the patient, only their own current shared rows; staff per the clinical-staff rule. Household
   proxies are a follow-up.
6. **Never** for a death, an administrative closure, or an encounter entered in error.
7. **Take-home medicines reach the tracker by the patient's tap** ("Add to my medicines"): a `self_medications` row
   prefilled from the prescription, linked by `source_prescription_id` (once per prescription), times left to the
   patient. Nothing is added without the tap; no dose the prescription did not state.
8. **No notification yet.** The dispatcher's kinds and copy are booking-shaped; a "summary ready" kind is a
   follow-up (no clinical content, by rule).

## Consequences

- `/patient/care` gets "Your visits"; the coming-next list loses what shipped.
- The patient printout uses the same composer, so paper and app never differ.
