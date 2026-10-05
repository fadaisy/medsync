# NCDReg condition modules

Generated from `lib/ncdreg/standard/` by `npm run ncdreg:docs`. Do not edit by hand.

Standard version **0.1.0-draft**. Status: **draft** throughout. Nothing here is approved for patient data;
every item needs Clinical Safety Officer and Registry Technical Group sign-off (docs/ncd/SIGNOFF-REGISTER.md).

| Code | Label | Level | Status | Version | Enabled by default | Outcome | Outcome label | Review components |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| diabetes | Diabetes | full | draft | 0.1.0-draft | yes | rule: glycaemic | In range | hba1c (12 m), kidney (12 m), eyes (12 m), feet (12 m), lipids (12 m) |
| hypertension | Hypertension | full | draft | 0.1.0-draft | yes | rule: bp_control | In range | kidney (12 m), lipids (12 m) |
| chronic_kidney_disease | Chronic kidney disease | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | kidney (12 m) |
| heart_failure | Heart failure | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | kidney (12 m) |
| cardiovascular_disease | Stroke, ischaemic heart disease or peripheral arterial disease | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | lipids (12 m) |
| asthma | Asthma | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | – |
| copd | Chronic obstructive pulmonary disease | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | – |
| sickle_cell_disease | Sickle cell disease | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | – |
| epilepsy | Epilepsy | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | – |
| thyroid_disease | Thyroid disease | core | draft | 0.1.0-draft | no | clinician recorded | Recorded as controlled | – |

## Diabetes (`diabetes`)

- Level: full. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: type_1, type_2, other_specific, unknown.
- Basis of diagnosis: fasting_glucose, random_glucose_with_symptoms, hba1c, ogtt, on_treatment_at_referral, unknown.
- Diagnosis codes: 5A10/E10 Type 1 diabetes; 5A11/E11 Type 2 diabetes; 5A13/E13 Other specified diabetes; 5A14/E14 Diabetes, unspecified (unverified).
- Medicine groups offered first: glucose_lowering, cardiovascular_protection.
- Visit fields: glucose (number, mmol/L, expected, visit_column); hba1c (number, %, offered, visit_column); hypoglycaemia (enum, offered, visit_column).
- Outcome: rule `glycaemic`, classes in_range, moderately_raised, very_raised, not_classifiable; leading class in_range.
- Admission reasons added: none.
- SMS banned terms: diabetes, diabetic, sugar, glucose, insulin, hba1c.

## Hypertension (`hypertension`)

- Level: full. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: primary, secondary, unknown.
- Basis of diagnosis: repeated_office_bp, home_or_ambulatory_bp, on_treatment_at_referral, unknown.
- Diagnosis codes: BA00/I10 Essential hypertension; BA04/I15 Secondary hypertension (unverified).
- Medicine groups offered first: blood_pressure, cardiovascular_protection.
- Visit fields: none beyond the shared fields.
- Outcome: rule `bp_control`, classes in_range, not_in_range; leading class in_range.
- Admission reasons added: none.
- SMS banned terms: hypertension, hypertensive, pressure, blood pressure, bp.

## Chronic kidney disease (`chronic_kidney_disease`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: dialysis_status (enum, offered, observation).
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: none.
- SMS banned terms: kidney, renal, dialysis, ckd.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Heart failure (`heart_failure`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: nyha_class (enum, offered, observation); oedema (boolean, offered, observation).
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: none.
- SMS banned terms: heart, cardiac, failure.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Stroke, ischaemic heart disease or peripheral arterial disease (`cardiovascular_disease`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: stroke, ischaemic_heart_disease, peripheral_arterial_disease, other.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: none beyond the shared fields.
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: none.
- SMS banned terms: stroke, heart, cardiac, cardiovascular, arterial.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Asthma (`asthma`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: exacerbations_since_last_visit (integer, offered, observation).
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: acute_asthma.
- SMS banned terms: asthma, inhaler, breathing.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Chronic obstructive pulmonary disease (`copd`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: exacerbations_since_last_visit (integer, offered, observation).
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: copd_exacerbation.
- SMS banned terms: copd, pulmonary, lung, inhaler, breathing.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Sickle cell disease (`sickle_cell_disease`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: painful_crises_since_last_visit (integer, offered, observation).
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: sickle_cell_crisis.
- SMS banned terms: sickle, crisis.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Epilepsy (`epilepsy`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: seizures_since_last_visit (integer, offered, observation).
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: seizure.
- SMS banned terms: epilepsy, seizure, fits.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

## Thyroid disease (`thyroid_disease`)

- Level: core. Status: draft. Version 0.1.0-draft, effective 2026-10-05.
- Subtypes: unknown.
- Basis of diagnosis: clinician_diagnosis, on_treatment_at_referral, unknown.
- Diagnosis codes: none (sign-off register).
- Medicine groups offered first: none; medicines through "other" until an approved list is supplied.
- Visit fields: none beyond the shared fields.
- Outcome: clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded".
- Admission reasons added: none.
- SMS banned terms: thyroid.
- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).

Adding a condition needs a catalogue record and nothing else: no migration, no new screen, no new indicator code.
