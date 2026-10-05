# NCDReg version 0.1 (draft)

Generated from `lib/ncdreg/standard/` by `npm run ncdreg:docs`. Do not edit by hand.

Standard version **0.1.0-draft**. Status: **draft** throughout. Nothing here is approved for patient data;
every item needs Clinical Safety Officer and Registry Technical Group sign-off (docs/ncd/SIGNOFF-REGISTER.md).

## 1. Record types and data dictionary

### Person

one per patient; identifiers, contacts, residence.

| Field | Type | Code list | Unit | Required | Identifying (encrypted) | Calculated | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| registry_number | text | – | – | yes | – | – | System-issued, unique per facility; DEMO- series reserved |
| hospital_number | text | – | – | – | yes | – | – |
| national_id | text | – | – | – | yes | – | Optional, never required |
| given_name | text | – | – | – | yes | – | – |
| family_name | text | – | – | – | yes | – | – |
| sex | code | sex | – | yes | – | – | – |
| date_of_birth | date | – | – | – | – | – | Or estimated age stored as a derived birth year with an estimated flag |
| birth_year | integer | – | – | yes | – | – | – |
| date_of_birth_estimated | boolean | – | – | – | – | – | – |
| phone_1 | text | – | – | – | yes | – | – |
| phone_2 | text | – | – | – | yes | – | – |
| next_of_kin_name | text | – | – | – | yes | – | – |
| next_of_kin_phone | text | – | – | – | yes | – | – |
| district | code | – | – | – | – | – | Uganda administrative dataset |
| sub_county | code | – | – | – | – | – | – |
| parish | text | – | – | – | yes | – | Free text: the dataset stops at sub-county |
| village | text | – | – | – | yes | – | – |
| sms_allowed | boolean | – | – | yes | – | – | – |
| calls_allowed | boolean | – | – | yes | – | – | – |
| privacy_notice_version | text | – | – | yes | – | – | – |
| privacy_notice_acknowledged_at | timestamp | – | – | yes | – | – | – |
| height_cm | number | – | cm | – | – | – | Expected at enrolment |
| tobacco | code | tobacco | – | – | – | – | – |
| alcohol | code | alcohol | – | – | – | – | – |
| known_cvd | codes | known_cvd | – | – | – | – | – |
| known_kidney_disease | boolean | – | – | – | – | – | – |
| family_history_diabetes | boolean | – | – | – | – | – | – |
| family_history_hypertension | boolean | – | – | – | – | – | – |
| is_synthetic | boolean | – | – | yes | – | – | – |

### Registration

one per condition per person; a condition enabled in the catalogue, date and basis of diagnosis.

| Field | Type | Code list | Unit | Required | Identifying (encrypted) | Calculated | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| condition | code | – | – | yes | – | – | A condition catalogue code |
| subtype | code | – | – | yes | – | – | From the module's subtypes |
| registration_date | date | – | – | yes | – | – | – |
| diagnosis_year | integer | – | – | yes | – | – | – |
| diagnosis_month | integer | – | – | – | – | – | – |
| basis_of_diagnosis | code | – | – | yes | – | – | From the module's list |
| where_first_diagnosed | code | where_first_diagnosed | – | – | – | – | – |
| referral_source | code | referral_source | – | – | – | – | – |

### Visit

one per clinic attendance; measurements, medicines, next appointment.

| Field | Type | Code list | Unit | Required | Identifying (encrypted) | Calculated | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| visit_date | date | – | – | yes | – | – | – |
| visit_type | code | visit_type | – | yes | – | – | – |
| weight_kg | number | – | kg | – | – | – | – |
| bp_readings | text | – | – | – | – | – | Up to three systolic/diastolic readings |
| visit_bp | text | – | – | – | – | yes | Mean of the readings |
| bmi | number | – | kg/m² | – | – | yes | – |
| glucose_mmol | number | – | mmol/L | – | – | – | Original value and unit kept |
| glucose_type | code | glucose_type | – | – | – | – | – |
| glucose_method | code | glucose_method | – | – | – | – | – |
| hba1c_percent | number | – | % | – | – | – | mmol/mol stored alongside |
| hba1c_result_date | date | – | – | – | – | – | – |
| medicines | codes | – | – | – | – | – | After this visit; carried forward, confirmed or edited. No doses |
| missed_doses | code | missed_doses | – | – | – | – | – |
| hypoglycaemia | code | hypoglycaemia | – | – | – | – | Offered by modules that list it |
| medicines_obtained | code | medicines_obtained | – | – | – | – | – |
| medicines_not_obtained_reason | code | not_obtained_reason | – | – | – | – | – |
| next_appointment_date | date | – | – | – | – | – | Or a disposition |
| disposition | code | disposition | – | – | – | – | – |
| recorded_control | code | – | – | – | – | – | Per core registration: controlled, partly, not, not assessed |
| observations | codes | – | – | – | – | – | Module observations, one row per code |

### Annual review

components, each dated; kidney, eyes, feet, lipids, other annual items.

| Field | Type | Code list | Unit | Required | Identifying (encrypted) | Calculated | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kidney.creatinine_umol | number | – | µmol/L | – | – | – | – |
| kidney.egfr | integer | – | – | – | – | yes | 2021 CKD-EPI |
| kidney.urine_test | code | urine_test | – | – | – | – | – |
| kidney.acr_mg_mmol | number | – | mg/mmol | – | – | – | – |
| kidney.dipstick | code | dipstick | – | – | – | – | – |
| kidney.kdigo_g | code | – | – | – | – | yes | – |
| kidney.kdigo_a | code | – | – | – | – | yes | From ACR only |
| eyes.examined | boolean | – | – | – | – | – | – |
| eyes.method | code | eye_method | – | – | – | – | – |
| eyes.retinopathy_grade | code | retinopathy_grade | – | – | – | – | – |
| eyes.macular_oedema | code | macular_oedema | – | – | – | – | – |
| eyes.referred | boolean | – | – | – | – | – | – |
| feet.loss_of_protective_sensation | boolean | – | – | – | – | – | – |
| feet.absent_pulses | boolean | – | – | – | – | – | – |
| feet.deformity | boolean | – | – | – | – | – | – |
| feet.current_ulcer | boolean | – | – | – | – | – | – |
| feet.previous_ulcer | boolean | – | – | – | – | – | – |
| feet.amputation | code | amputation | – | – | – | – | – |
| feet.risk_category | integer | – | – | – | – | yes | – |
| lipids.total_cholesterol | number | – | mmol/L | – | – | – | – |
| lipids.ldl | number | – | mmol/L | – | – | – | – |
| other.cv_risk_category | code | cv_risk | – | – | – | – | As recorded; never calculated |
| other.ecg_done | boolean | – | – | – | – | – | – |
| other.lvh | code | lvh | – | – | – | – | – |
| other.tobacco | code | tobacco | – | – | – | – | – |
| other.alcohol | code | alcohol | – | – | – | – | – |

### Event

one per occurrence; admission, complication, transfer, death, withdrawal.

| Field | Type | Code list | Unit | Required | Identifying (encrypted) | Calculated | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| event_type | code | event_type | – | yes | – | – | – |
| event_date | date | – | – | yes | – | – | – |
| event_date_estimated | boolean | – | – | – | – | – | – |
| reporting_unit | code | reporting_unit | – | yes | – | – | – |
| admission_reason | code | admission_reason | – | – | – | – | – |
| death_place | code | death_place | – | – | – | – | – |
| death_cause | text | – | – | – | yes | – | Optional free text, encrypted |
| death_source | code | death_source | – | – | – | – | – |
| transfer_destination | text | – | – | – | yes | – | Free text, encrypted |

## 2. Code lists

### Reporting unit (`reporting_unit`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| ncd_clinic | NCD clinic |
| medical_ward | Medical ward |
| dialysis_unit | Dialysis unit |
| other | Other |

### Sex (`sex`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| female | Female |
| male | Male |

### Where first diagnosed (`where_first_diagnosed`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| this_facility | This facility |
| other_facility | Another facility |
| unknown | Unknown |

### Referral source (`referral_source`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| self | Self |
| outpatients | Outpatients |
| ward | Ward |
| other_facility | Another facility |
| community_screening | Community screening |
| other | Other |

### Tobacco (`tobacco`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| never | Never |
| former | Former |
| current | Current |

### Alcohol (`alcohol`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| none | None |
| occasional | Occasional |
| regular | Regular |

### Known cardiovascular disease (`known_cvd`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| stroke | Stroke |
| ischaemic_heart_disease | Ischaemic heart disease |
| heart_failure | Heart failure |
| peripheral_arterial_disease | Peripheral arterial disease |

### Visit type (`visit_type`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| scheduled | Scheduled |
| unscheduled | Unscheduled |
| refill_only | Refill only |
| remote | Remote |

### Glucose type (`glucose_type`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| fasting | Fasting |
| random | Random |
| post_meal | After meal |

### Glucose method (`glucose_method`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| capillary | Capillary |
| laboratory | Laboratory |

### Missed doses in the past 7 days (`missed_doses`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| none | None |
| 1_to_2_days | 1 to 2 days |
| 3_or_more_days | 3 or more days |
| not_asked | Not asked |

### Hypoglycaemia since last visit (`hypoglycaemia`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| none | None |
| mild_self_treated | Mild, self-treated |
| severe_needed_help | Severe, needed help |
| not_asked | Not asked |

### Medicines obtained (`medicines_obtained`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| full | In full |
| partial | In part |
| none | None |
| not_applicable | Not applicable |

### Reason not obtained in full (`not_obtained_reason`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| stock_out | Stock-out |
| cost | Cost |
| other | Other |

### Disposition (`disposition`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| transfer_out | Transfer out |
| discharged_to_primary_care | Discharged to primary care |

### Urine test (`urine_test`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| acr | Albumin-to-creatinine ratio |
| dipstick | Dipstick protein |

### Dipstick protein (`dipstick`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| negative | Negative |
| trace | Trace |
| 1+ | 1+ |
| 2+ | 2+ |
| 3+ | 3+ |

### Eye examination method (`eye_method`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| dilated_fundoscopy | Dilated fundoscopy |
| fundus_photograph | Fundus photograph |
| other | Other |

### Retinopathy grade, worse eye (`retinopathy_grade`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| no_apparent_retinopathy | No apparent retinopathy |
| mild_npdr | Mild non-proliferative |
| moderate_npdr | Moderate non-proliferative |
| severe_npdr | Severe non-proliferative |
| proliferative | Proliferative |
| ungradable | Ungradable |

### Macular oedema (`macular_oedema`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| absent | Absent |
| present | Present |
| not_assessed | Not assessed |

### Amputation (`amputation`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| none | None |
| minor | Minor |
| major | Major |

### Cardiovascular risk category, as recorded (`cv_risk`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| lt_5 | Below 5% |
| 5_to_lt_10 | 5% to below 10% |
| 10_to_lt_20 | 10% to below 20% |
| 20_to_lt_30 | 20% to below 30% |
| gte_30 | 30% or above |
| not_assessed | Not assessed |

### Left ventricular hypertrophy (`lvh`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| yes | Yes |
| no | No |
| unknown | Unknown |

### Event type (`event_type`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| admission | Admission |
| stroke | Stroke |
| acute_coronary_syndrome | Acute coronary syndrome |
| heart_failure_new | New heart failure |
| foot_ulcer_new | New foot ulcer |
| amputation_minor | Minor amputation |
| amputation_major | Major amputation |
| dialysis_start | Dialysis start |
| visual_loss_or_laser | Visual loss or laser treatment |
| pregnancy | Pregnancy |
| transfer_out | Transfer out |
| death | Death |
| withdrawal | Withdrawal |

### Admission main reason (`admission_reason`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| diabetic_ketoacidosis | Diabetic ketoacidosis |
| hyperosmolar_state | Hyperosmolar state |
| severe_hypoglycaemia | Severe hypoglycaemia |
| hypertensive_emergency | Hypertensive emergency |
| stroke | Stroke |
| acute_coronary_syndrome | Acute coronary syndrome |
| heart_failure | Heart failure |
| foot_sepsis | Foot sepsis |
| other | Other |

### Place of death (`death_place`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| this_facility | This facility |
| other_facility | Another facility |
| home | Home |
| unknown | Unknown |

### Information source (`death_source`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| ward | Ward |
| family_call | Family, by call |
| records | Records |
| other | Other |

### Call outcome (`call_outcome`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| will_return | Will return |
| call_later | Call later |
| no_answer | No answer |
| moved_or_transferred | Moved or transferred |
| died | Died |
| wrong_number | Wrong number |
| declined | Declined |

### Stage (`stage`, 0.1.0-draft, draft)

| Code | Label |
| --- | --- |
| not_arrived | Not arrived |
| waiting | Waiting |
| measurements_taken | Measurements taken |
| with_clinician | With clinician |
| closed | Closed |

### Observation codes (LOINC candidates) (`observation_loinc`, 0.1.0-draft, draft, unverified)

| Code | Label |
| --- | --- |
| 8480-6 | Systolic blood pressure |
| 8462-4 | Diastolic blood pressure |
| 29463-7 | Body weight |
| 8302-2 | Body height |
| 39156-5 | Body mass index |
| 4548-4 | HbA1c |
| 14771-0 | Fasting glucose |
| 14749-6 | Glucose in serum or plasma |
| 14743-9 | Capillary glucose by glucometer |
| 14682-9 | Creatinine |
| 98979-8 | eGFR, 2021 CKD-EPI |
| 14585-4 | Urine albumin-to-creatinine ratio |
| 14647-2 | Total cholesterol |
| 22748-8 | LDL cholesterol |

### Medicine list (0.1.0-draft, draft, unverified ATC)

| Code | Label | ATC | Group |
| --- | --- | --- | --- |
| metformin | Metformin | A10BA02 | glucose_lowering |
| glibenclamide | Glibenclamide | A10BB | glucose_lowering |
| gliclazide | Gliclazide | A10BB | glucose_lowering |
| glimepiride | Glimepiride | A10BB | glucose_lowering |
| soluble_insulin | Soluble insulin | A10A | glucose_lowering |
| isophane_insulin | Isophane insulin | A10A | glucose_lowering |
| premixed_insulin | Premixed insulin | A10A | glucose_lowering |
| insulin_analogue | Insulin analogue | A10A | glucose_lowering |
| other_glucose_lowering | Other glucose-lowering medicine | A10 | glucose_lowering |
| enalapril | Enalapril | C09A | blood_pressure |
| lisinopril | Lisinopril | C09A | blood_pressure |
| captopril | Captopril | C09A | blood_pressure |
| losartan | Losartan | C09C | blood_pressure |
| telmisartan | Telmisartan | C09C | blood_pressure |
| amlodipine | Amlodipine | C08 | blood_pressure |
| nifedipine | Nifedipine | C08 | blood_pressure |
| bendroflumethiazide | Bendroflumethiazide | C03A | blood_pressure |
| hydrochlorothiazide | Hydrochlorothiazide | C03A | blood_pressure |
| atenolol | Atenolol | C07 | blood_pressure |
| bisoprolol | Bisoprolol | C07 | blood_pressure |
| carvedilol | Carvedilol | C07 | blood_pressure |
| spironolactone | Spironolactone | C03DA01 | blood_pressure |
| furosemide | Furosemide | – | blood_pressure |
| hydralazine | Hydralazine | – | blood_pressure |
| methyldopa | Methyldopa | – | blood_pressure |
| other_blood_pressure | Other blood pressure medicine | – | blood_pressure |
| atorvastatin | Atorvastatin | C10AA | cardiovascular_protection |
| simvastatin | Simvastatin | C10AA | cardiovascular_protection |
| rosuvastatin | Rosuvastatin | C10AA | cardiovascular_protection |
| aspirin | Aspirin | B01AC06 | cardiovascular_protection |
| clopidogrel | Clopidogrel | – | cardiovascular_protection |
| other | Other | – | other |

No doses are recorded in this version.

## 3. Calculations

| Id | Formula version | Status | Definition |
| --- | --- | --- | --- |
| bmi | bmi-1 | draft | weight kg ÷ (height m)², 1 dp |
| visit_bp | visit-bp-mean-1 | draft | mean of readings, each component rounded |
| glucose_unit | glucose-mgdl-1 | draft | mg/dL ÷ 18.016, 1 dp |
| creatinine_unit | creat-mgdl-1 | draft | mg/dL × 88.4 |
| hba1c_ifcc | hba1c-ifcc-1 | draft | round((% − 2.15) × 10.929) |
| egfr | ckd-epi-2021-cr | draft | 2021 CKD-EPI creatinine equation |
| kdigo_g | kdigo-g-1 | draft | G1 ≥90; G2 60–89; G3a 45–59; G3b 30–44; G4 15–29; G5 <15 |
| kdigo_a | kdigo-a-1 | draft | ACR mg/mmol: A1 <3; A2 3–30; A3 >30. Dipstick: none |
| foot_risk | iwgdf-0-3-1 | draft | 0–3 from sensation, pulses, deformity, history |
| htn_grade | htn-grade-1 | draft | Three grades; awaits UCG 2023 confirmation |
| care_band | care-band-1 | draft | Four bands; complication rule is draft |
| status | status-1 | draft | died > withdrawn > transferred > LTFU > overdue > active |

Hypertension grade table (htn-grade-1, draft): Draft. Awaits confirmation against the Uganda Clinical Guidelines 2023.

| Grade | Systolic from | Diastolic from |
| --- | --- | --- |
| 3 | 180 | 110 |
| 2 | 160 | 100 |
| 1 | 140 | 90 |

Care band complication rule (care-band-1, draft): registrations chronic_kidney_disease, heart_failure, cardiovascular_disease; events stroke, acute_coronary_syndrome, heart_failure_new, dialysis_start, foot_ulcer_new, amputation_minor, amputation_major; known cardiovascular disease; eGFR below 60 or ACR A2/A3; retinopathy of any grade or macular oedema; foot risk 2 or 3, current ulcer or amputation.

Every calculated category is shown as "category from latest result", never as a diagnosis.

## 4. Outcome classifications

| Id | Version | Status | Rule |
| --- | --- | --- | --- |
| bp_control | bp-control-hearts360-1 | draft | Visit blood pressure below 140 and below 90 is in range; otherwise not in range. |
| glycaemic | glycaemic-hearts360-1 | draft | HbA1c dated within the window if one exists (below 7.0% in range; 7.0 to 8.9% moderately raised; 9.0% or above very raised); otherwise fasting glucose (below 7.0; 7.0 to 11.0; 11.1 mmol/L or above). Random or after-meal glucose only: not classifiable. |

## 5. Validation

### Hard blocks (validation-1)

| Rule | Blocks |
| --- | --- |
| adult_only | Age under 18 at registration |
| non_negative | Negative or non-numeric values |
| no_future_dates | Future dates |
| no_visit_after_death | A visit dated after a recorded death |
| no_visit_before_registration | A visit before the registration date unless flagged historical |

### Confirm, never block (validation-1)

| Field | Low | High |
| --- | --- | --- |
| systolic | 60 | 300 |
| diastolic | 30 | 200 |
| weight_kg | 20 | 300 |
| height_cm | 100 | 220 |
| glucose_mmol | 1 | 60 |
| hba1c_percent | 3 | 20 |
| creatinine_umol | 20 | 2500 |
| acr_mg_mmol | 0 | 1000 |
| total_cholesterol | 1 | 20 |
| ldl | 0.3 | 15 |

Systolic not above diastolic also asks for confirmation.

### Consistency queries (validation-1): to the registry lead's query list, never an alert

| Rule | Query |
| --- | --- |
| type_1_without_insulin | Type 1 diabetes with no insulin on the medicine list |
| diagnosis_before_birth | Diagnosis year before birth year |
| pregnancy_male | Pregnancy event for a male patient |
| duplicate_registration | Two registrations of the same condition |
| weight_change_20pct | Weight change above 20% between visits less than 90 days apart |
| same_day_duplicate_visit | Two visits for the same patient on the same date |
| merge_duplicate_registration | Merged persons both held a registration for the same condition |

### Duplicate check (dup-tiers-1, draft)

Definite: same hospital number or same national ID. Probable: same phone plus similar name, or similar name plus same sex plus birth year within 2. Possible: similar name plus same sex (the 5 closest are listed). Similar name: names normalised (lower case, accents and punctuation stripped, doubled letters collapsed, final h dropped); similar when some token pair has Jaro-Winkler at or above the threshold, threshold 0.9.

## 6. Indicators

Windows (ind-0.1.0-draft): past 3 months = the reporting month and the two before it; past 12 months = the reporting month and the eleven before it; returned to care within 15 days. Time zone: the facility's (Africa/Kampala by default).

| Code | Indicator | Numerator | Denominator | Condition | Version |
| --- | --- | --- | --- | --- | --- |
| C01 | Patients under care | Registered, with at least 1 visit in the past 12 months; excluding died, and transferred out or withdrawn from the event date | Count | – | ind-0.1.0-draft |
| C02 | Cumulative registered | All registered, excluding died | Count | – | ind-0.1.0-draft |
| C03 | New registrations | Registered in the month | Count | – | ind-0.1.0-draft |
| C04 | Blood pressure below 140/90 | Visit blood pressure below 140 and below 90 at the latest visit in the past 3 months | Hypertension patients under care, registered before the past 3 months | hypertension | ind-0.1.0-draft |
| C05 | Blood pressure 140/90 or above | 140 or above, or 90 or above, at the latest visit in the past 3 months | Same as C04 | hypertension | ind-0.1.0-draft |
| C06 | No visit in past 3 months, hypertension | No visit in the past 3 months | Same as C04 | hypertension | ind-0.1.0-draft |
| C07 | Blood sugar in range | Fasting glucose below 7.0 mmol/L or HbA1c below 7.0% at the latest visit in the past 3 months | Diabetes patients under care, registered before the past 3 months | diabetes | ind-0.1.0-draft |
| C08 | Blood sugar moderately raised | Fasting glucose 7.0 to 11.0 mmol/L or HbA1c 7.0 to 8.9% | Same as C07 | diabetes | ind-0.1.0-draft |
| C09 | Blood sugar very raised | Fasting glucose 11.1 mmol/L or above, or HbA1c 9.0% or above | Same as C07 | diabetes | ind-0.1.0-draft |
| C10 | Blood sugar not classifiable | Latest visit in the past 3 months has only random or after-meal glucose | Same as C07 | diabetes | ind-0.1.0-draft |
| C11 | No visit in past 3 months, diabetes | No visit in the past 3 months | Same as C07 | diabetes | ind-0.1.0-draft |
| C12 | Lost to follow-up at 12 months | No visit in the past 12 months (never counted within 12 months of registration) | Cumulative registered, excluding died | – | ind-0.1.0-draft |
| C13 | Overdue patients | Appointment date passed with no visit, on the 1st of the month; excluding removed from the list and no phone number | Patients under care | – | ind-0.1.0-draft |
| C14 | Overdue patients called | Unique overdue patients called in the month | C13 numerator | – | ind-0.1.0-draft |
| C15 | Returned to care | Visit within 15 days of the first call in the month | C14 numerator | – | ind-0.1.0-draft |
| C16 | Quarterly cohort outcome | Leading class, not in it, or no visit, at the latest visit in the following quarter | Patients registered in the quarter | – | ind-0.1.0-draft |
| G01 | Registered | Registrations of the condition, excluding died | Count | – | ind-0.1.0-draft |
| G02 | Under care | G01 with at least 1 visit in the past 12 months, with the exclusions of C01 | Count | – | ind-0.1.0-draft |
| G03 | New registrations | Registered for the condition in the month | Count | – | ind-0.1.0-draft |
| G04 | Outcome at latest visit | Patients in each outcome class at the latest visit in the past 3 months, plus not recorded and no visit | Patients under care for the condition, registered before the past 3 months | – | ind-0.1.0-draft |
| G05 | Lost to follow-up at 12 months | No visit in the past 12 months | G01 | – | ind-0.1.0-draft |
| G06 | Care cascade | Registered; under care; visit in past 3 months; leading class at latest visit in past 3 months | Each step as a percentage of G01 | – | ind-0.1.0-draft |
| H01 | HbA1c tested | At least 1 HbA1c result in the past 12 months | Diabetes patients under care | diabetes | ind-0.1.0-draft |
| H02 | Kidney review done | Creatinine and a urine protein test in the past 12 months | Patients under care holding a registration whose module lists the kidney component | – | ind-0.1.0-draft |
| H03 | Eye examination done | Eye component with examined = yes in the past 12 months | Diabetes patients under care | diabetes | ind-0.1.0-draft |
| H04 | Foot examination done | Foot component recorded in the past 12 months | Diabetes patients under care | diabetes | ind-0.1.0-draft |
| H05 | Blood pressure controlled in diabetes | Below 140/90, and separately below 130/80, at the latest visit in the past 3 months | Diabetes patients under care, registered before the past 3 months | diabetes | ind-0.1.0-draft |
| H06 | Statin on medicine list | Statin present at the latest visit in the past 12 months | Diabetes patients under care aged 40 or above | diabetes | ind-0.1.0-draft |
| H07 | Kidney category distribution | Patients in each G category and each A category | Patients with a kidney review in the past 12 months | – | ind-0.1.0-draft |
| H08 | Event rates | Events in the past 12 months, by type and by admission reason | Per 1,000 patients under care at the as-of date | – | ind-0.1.0-draft |
| H09 | Medicines not obtained in full | Visits with partial or none, by reason | Visits where medicines obtained is not not-applicable | – | ind-0.1.0-draft |
| H10 | Completeness | Visits with all applicable every-visit core fields present | All non-historical visits in the month | – | ind-0.1.0-draft |
| H11 | Same-day entry | Visits entered on the visit date | All non-historical visits in the month | – | ind-0.1.0-draft |
| H12 | Care band distribution | Patients in each of the four bands | Patients under care with a diabetes or hypertension registration | – | ind-0.1.0-draft |

G-indicators are computed for every enabled condition and reported as code plus condition, for example `G04.asthma`.

## 7. Condition catalogue

See CONDITION-MODULES.md.
