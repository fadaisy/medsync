# ADR 0355 — The patient's own history on the phone, pre-filled (unconfirmed) on the clerking desk

**Status:** Accepted, 2026-10-18. Owner request. It builds on ADR 0354 (the care team reads what the patient logs) and ADR 0350 (tap to turn).

## Context

The Me tab had a free-text "known conditions" line, an allergy row that only said "Tell your nurse", and no family history. The card's back showed the front mirrored on the phone. Some rows changed nothing: Language switched a scaffold with no Luganda strings, and A+ enlarged only the Me screen. The owner wants three things:

- the patient enters their history from the same lists the clinician uses;
- that history reaches the clinician's encounter, marked as not confirmed;
- every Me row works.

## Decision

1. **One vocabulary.** The patient picks from the signed clerking catalogue MS-EMR-CLERK-CAT-001:
   - past-history conditions (25);
   - allergy quick picks (12), with their reactions and severity;
   - family-history conditions (12), with relations.

   `lib/patient/reported-history.ts` holds a copy of those ids and labels. It has no imports, and the phone (`@patient/`) and the desk both use it. `tests/patient/reported-history.test.ts` fails the moment the copy differs from the JSON. Anything not on a list goes in the patient's own words (`other`, up to 120 characters).
2. **Storage: migration 0175** adds `patient_reported_history`, one table with a `kind` column: condition, allergy, family or no_known_allergies. Each kind may carry only its own fields.
   - **The patient's own rows.** The patient inserts rows and can retire one (active → removed): update is granted on two columns only, and nobody can delete. An edit is a new row that names the old one (`supersedes_id`). A trigger retires the old row in the same statement. Recording an allergy retires "no known allergies".
   - **Audited.** Every change goes through `audit_log_changes`.
   - **Who reads it.** The care team reads active rows through `has_clinical_relationship`. The desk's reader role reads them under the record's own rule (`private.accessible_patient_ids`).
3. **Prefill, never auto-confirm.** The v2 clerking desk shows the rows at the top of Conditions, Allergies and Family history under a "Patient-reported, not yet confirmed" tag, in a dashed panel.
   - **Confirm, condition:** answers yes in the note. The "known for" value comes from the patient's year: this year is under 1 year, up to 5 years back is 1 to 5, older is over 5. The existing "Confirm on the problem list" step is unchanged.
   - **Confirm, family condition:** answers yes for every relative the patient named.
   - **Confirm, allergy:** records it on the allergy record with the patient as source. It stays unconfirmed, as all allergy rows are by default.
   - **Confirm, no known allergies:** records a clinician's NKDA assertion.
   - **Dismiss** hides a row for this visit (`history.reportedDismissed`).
   - **When a row closes on its own.** A row whose condition the clinician already answered, or whose allergy is already on the record by name, is closed.
   - **Restricted entries.** HIV, TB, mental illness and reproductive health keep the lock.
4. **The card's back** is a real face:
   - **What it shows:** "In an emergency", the MedSync number large, the patient's allergies, and their conditions (only when "Show conditions on my card" is on, and never a private one). It also says whether a next of kin is on file (the number is encrypted server-side and never on the phone). The last line says who to call if the card is found: the home facility's activated emergency number, or "return it to" the facility.
   - **No blood group:** nothing records one.
   - **The turn.** Each face turns on its own, half a turn apart, as the ticket does (ADR 0350). A parent turned with both faces inside showed the front mirrored.
   - **Help's medic card** uses the same lines.
5. **Every Me row works:**
   - My conditions, Allergies and Family history open their editors.
   - Language shows the preferred language saved on the profile and opens Profile details.
   - Text size says it follows the phone's setting. The app has never turned that off.
   - The privacy row says who sees what: readings and history go to the care team, while medicines stay the patient's own.
   - The version line reads the app's real version.
   - The phone-only `lang` and `big` preferences are gone.

## Consequences

- The owner applies migration 0175 (`cd ~/Desktop/medsync-tide && npm run db:migrate`). Until then the phone shows "Saving your health history is not switched on yet", and the desk shows nothing.
- The v1 encounter desk (hospitals without `CLERKING_V2`), the doctor's and nurse's patient pages and the FHIR export do not show patient-reported history yet. The older `patient_profiles.known_conditions` words appear on the conditions screen as a prompt to re-add them from the list. They still stand in on the card while the list is empty.
- A patient's report is never a clinical record. Only a clinician's confirm writes one, through the paths the desk already audits.
