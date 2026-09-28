# ADR 0186 — EMR prescribing follows the resus dialog

**Status:** Proposed — 2026-09-28. Supersedes, for signed and verified formulary entries only, the EMR prescribing
sheet's rule that nothing proposes a dose. Migration 0088 is GATED. The new checks are marked "proposed" until the
CSO signs each one.

## Context

The resus prescribing dialog (ADRs 0051, 0052, 0054) resolves a signed regimen for the patient, shows each default,
lets the clinician adjust it with the default struck through, and records the edits and any override reason. The
EMR sheet asks the prescriber to type everything and offers no regimen. The Plan needs one prescribing surface that
is quick where a signed reference exists and never invents one where it does not.

## Decision

1. **A landscape dialog with three columns** (what, how, check), about 1240 px wide (`EmrDialog` gains an `xl`
   width); on a narrow screen the columns stack in that order.
2. **A dose is pre-set only from a signed, verified regimen:** `dose.status` `verified`, a source with a verbatim
   quote containing the numbers and the date checked, and `csoSigned: true`. One tap sets dose, strength, route,
   method, frequency and course. Otherwise the dialog says "No verified regimen yet" and the prescriber types the
   number and taps the rest.
3. **Edits are visible and recorded.** A value changed from the regimen is shown struck through beside the new one
   and stored as `edits: [{field, from, to}]` against the `regimen_id`.
4. **Checks.** `runSafetyChecks` is reused. New checks, each marked proposed: allergy by name, class and the
   catalogue's allergy groups (cross-reactivity not checked, and said so for beta-lactams); dose against reference
   (or "not checked" with the reason); kidney function from the latest creatinine; weight (ADR 0188); child under 16;
   already prescribed (same class this visit or on the admission list); indication against the latest result (IV
   glucose above 4.0 mmol/L); cultures before antibiotics; interactions "not checked"; pharmacy stock (ADR 0190);
   co-sign from `clinical_cosign_policies`; a witness for a controlled drug.
5. **Answers.** A check that fires needs an answer from reason chips (draft wording for the CSO); a stop needs an
   override reason. The answers go to `check_answers`, the reason is encrypted like `confirm_reason_ciphertext`.
6. **The server re-runs every check on place.** A non-overrideable stop still refuses; a missing answer refuses.
7. **Fluids** replace the drug controls: purpose, volume, time, pump or gravity set (20 or 60 drops per mL),
   warmed. Rate in mL/h and drops/min is arithmetic only.
8. **Storage** (0088): `method`, `infusion_over`, `diluent`, `prn`, `regimen_id`, `edits`, `condition_id`, `start`,
   `kind`, `fluid_purpose`, `volume_ml`, `over_minutes`, `giving_set_drops_per_ml`, `warmed`, `check_answers`.
   Course is the existing `duration` (0074). Reconciliation gains `held`, with a reason like `stopped`.
   `medication_administration_records` gains a real foreign key column to `prescriptions` (the text
   `prescription_id` holds free strings that cannot be cast).

## Consequences

- With the Plan flag off, the EMR sheet is unchanged.
- The three signed emergency entries are the only regimens that pre-set a dose at launch (ADR 0187).
- Interactions are not checked until an interaction reference is signed; the dialog says so every time.

## Alternatives considered

- **Keep typing everything:** safe but slow, and ignores a signed reference the hospital already trusts in resus.
- **Pre-set doses from the draft catalogue:** forbidden; no dose ships from memory.
