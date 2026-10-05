# NCDReg indicators

Generated from `lib/ncdreg/standard/` by `npm run ncdreg:docs`. Do not edit by hand.

Standard version **0.1.0-draft**. Status: **draft** throughout. Nothing here is approved for patient data;
every item needs Clinical Safety Officer and Registry Technical Group sign-off (docs/ncd/SIGNOFF-REGISTER.md).

Each indicator's definition and version, and the golden-dataset expectation it is tested against (tests/ncdreg-db/golden: 69 hand-designed synthetic patients, reporting month 2026-09). The patients behind each number are listed by their fixture ids. G-indicators are reported per enabled condition.

## C01 — Patients under care

- Numerator: Registered, with at least 1 visit in the past 12 months; excluding died, and transferred out or withdrawn from the event date
- Denominator: Count
- Version: ind-0.1.0-draft (draft)
- Golden `C01`: num 57
  - num: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, A01, A02, A03, A04, A05, K01, K02, K03, X05, R01, R02, R03, R04, R05, R06, R07, R10, R11, R12, R13

## C02 — Cumulative registered

- Numerator: All registered, excluding died
- Denominator: Count
- Version: ind-0.1.0-draft (draft)
- Golden `C02`: num 65
  - num: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, A01, A02, A03, A04, A05, K01, K02, K03, K04, X02, X03, X05, R01, R02, R03, R04, R05, R06, R07, R09, R10, R11, R12, R13, L02

## C03 — New registrations

- Numerator: Registered in the month
- Denominator: Count
- Version: ind-0.1.0-draft (draft)
- Golden `C03`: num 3
  - num: H07, D13, A05

## C04 — Blood pressure below 140/90

- Numerator: Visit blood pressure below 140 and below 90 at the latest visit in the past 3 months
- Denominator: Hypertension patients under care, registered before the past 3 months
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): hypertension
- Golden `C04`: num 14, den 32
  - num: H01, H08, H10, H12, H16, H17, B01, B03, B07, B08, A04, X05, R01, R10
  - den: H01, H02, H03, H04, H05, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13
- Golden `not_recorded.hypertension`: num 1, den 32
  - num: H05
  - den: H01, H02, H03, H04, H05, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13

## C05 — Blood pressure 140/90 or above

- Numerator: 140 or above, or 90 or above, at the latest visit in the past 3 months
- Denominator: Same as C04
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): hypertension
- Golden `C05`: num 10, den 32
  - num: H02, H03, H09, H11, H15, B02, B05, K02, R02, R13
  - den: H01, H02, H03, H04, H05, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13

## C06 — No visit in past 3 months, hypertension

- Numerator: No visit in the past 3 months
- Denominator: Same as C04
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): hypertension
- Golden `C06`: num 7, den 32
  - num: H04, R04, R05, R06, R07, R11, R12
  - den: H01, H02, H03, H04, H05, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13

## C07 — Blood sugar in range

- Numerator: Fasting glucose below 7.0 mmol/L or HbA1c below 7.0% at the latest visit in the past 3 months
- Denominator: Diabetes patients under care, registered before the past 3 months
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `C07`: num 8, den 22
  - num: D01, D06, D09, D11, D14, B01, B03, B08
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03
- Golden `not_recorded.diabetes`: num 2, den 22
  - num: D07, D16
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03

## C08 — Blood sugar moderately raised

- Numerator: Fasting glucose 7.0 to 11.0 mmol/L or HbA1c 7.0 to 8.9%
- Denominator: Same as C07
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `C08`: num 4, den 22
  - num: D02, D03, D15, B07
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03

## C09 — Blood sugar very raised

- Numerator: Fasting glucose 11.1 mmol/L or above, or HbA1c 9.0% or above
- Denominator: Same as C07
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `C09`: num 3, den 22
  - num: D04, D08, B02
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03

## C10 — Blood sugar not classifiable

- Numerator: Latest visit in the past 3 months has only random or after-meal glucose
- Denominator: Same as C07
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `C10`: num 3, den 22
  - num: D05, B05, X05
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03

## C11 — No visit in past 3 months, diabetes

- Numerator: No visit in the past 3 months
- Denominator: Same as C07
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `C11`: num 2, den 22
  - num: D10, R03
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03

## C12 — Lost to follow-up at 12 months

- Numerator: No visit in the past 12 months (never counted within 12 months of registration)
- Denominator: Cumulative registered, excluding died
- Version: ind-0.1.0-draft (draft)
- Golden `C12`: num 3, den 65
  - num: H13, D12, L02
  - den: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, A01, A02, A03, A04, A05, K01, K02, K03, K04, X02, X03, X05, R01, R02, R03, R04, R05, R06, R07, R09, R10, R11, R12, R13, L02

## C13 — Overdue patients

- Numerator: Appointment date passed with no visit, on the 1st of the month; excluding removed from the list and no phone number
- Denominator: Patients under care
- Version: ind-0.1.0-draft (draft)
- Golden `C13`: num 9, den 58
  - num: R01, R02, R06, R07, R08, R09, R11, R13, L02
  - den: H01, H02, H03, H04, H05, H06, H08, H09, H10, H11, H12, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B04, B05, B08, A01, A02, A03, A04, K01, K02, K03, X01, X02, X05, R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, L02

## C14 — Overdue patients called

- Numerator: Unique overdue patients called in the month
- Denominator: C13 numerator
- Version: ind-0.1.0-draft (draft)
- Golden `C14`: num 5, den 9
  - num: R01, R02, R07, R08, R09
  - den: R01, R02, R06, R07, R08, R09, R11, R13, L02

## C15 — Returned to care

- Numerator: Visit within 15 days of the first call in the month
- Denominator: C14 numerator
- Version: ind-0.1.0-draft (draft)
- Golden `C15`: num 1, den 5
  - num: R01
  - den: R01, R02, R07, R08, R09

## C16 — Quarterly cohort outcome

- Numerator: Leading class, not in it, or no visit, at the latest visit in the following quarter
- Denominator: Patients registered in the quarter
- Version: ind-0.1.0-draft (draft)
- Golden `C16.hypertension`: 2025-Q3:cohort 3, 2025-Q3:in_range 2, 2025-Q3:other 0, 2025-Q3:not_recorded 0, 2025-Q3:no_visit 1, 2025-Q4:cohort 3, 2025-Q4:in_range 1, 2025-Q4:other 1, 2025-Q4:not_recorded 1, 2025-Q4:no_visit 0, 2026-Q1:cohort 2, 2026-Q1:in_range 1, 2026-Q1:other 0, 2026-Q1:not_recorded 0, 2026-Q1:no_visit 1, 2026-Q2:cohort 2, 2026-Q2:in_range 1, 2026-Q2:other 1, 2026-Q2:not_recorded 0, 2026-Q2:no_visit 0
  - 2025-Q3:cohort: H10, H12, K02
  - 2025-Q3:in_range: H10, K02
  - 2025-Q3:other: none
  - 2025-Q3:not_recorded: none
  - 2025-Q3:no_visit: H12
  - 2025-Q4:cohort: H11, H16, X04
  - 2025-Q4:in_range: X04
  - 2025-Q4:other: H16
  - 2025-Q4:not_recorded: H11
  - 2025-Q4:no_visit: none
  - 2026-Q1:cohort: H08, H14
  - 2026-Q1:in_range: H08
  - 2026-Q1:other: none
  - 2026-Q1:not_recorded: none
  - 2026-Q1:no_visit: H14
  - 2026-Q2:cohort: H09, B08
  - 2026-Q2:in_range: B08
  - 2026-Q2:other: H09
  - 2026-Q2:not_recorded: none
  - 2026-Q2:no_visit: none
- Golden `C16.diabetes`: 2025-Q3:cohort 2, 2025-Q3:in_range 1, 2025-Q3:other 1, 2025-Q3:not_recorded 0, 2025-Q3:no_visit 0, 2025-Q4:cohort 2, 2025-Q4:in_range 0, 2025-Q4:other 2, 2025-Q4:not_recorded 0, 2025-Q4:no_visit 0, 2026-Q1:cohort 2, 2026-Q1:in_range 0, 2026-Q1:other 1, 2026-Q1:not_recorded 0, 2026-Q1:no_visit 1, 2026-Q2:cohort 2, 2026-Q2:in_range 1, 2026-Q2:other 0, 2026-Q2:not_recorded 1, 2026-Q2:no_visit 0
  - 2025-Q3:cohort: D14, B05
  - 2025-Q3:in_range: B05
  - 2025-Q3:other: D14
  - 2025-Q3:not_recorded: none
  - 2025-Q3:no_visit: none
  - 2025-Q4:cohort: D09, X04
  - 2025-Q4:in_range: none
  - 2025-Q4:other: D09, X04
  - 2025-Q4:not_recorded: none
  - 2025-Q4:no_visit: none
  - 2026-Q1:cohort: D10, D15
  - 2026-Q1:in_range: none
  - 2026-Q1:other: D10
  - 2026-Q1:not_recorded: none
  - 2026-Q1:no_visit: D15
  - 2026-Q2:cohort: D11, D16
  - 2026-Q2:in_range: D11
  - 2026-Q2:other: none
  - 2026-Q2:not_recorded: D16
  - 2026-Q2:no_visit: none

## G01 — Registered

- Numerator: Registrations of the condition, excluding died
- Denominator: Count
- Version: ind-0.1.0-draft (draft)
- Golden `G01.diabetes`: num 26
  - num: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X03, X05, R03
- Golden `G01.hypertension`: num 40
  - num: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X02, X05, R01, R02, R04, R05, R06, R07, R09, R10, R11, R12, R13, L02
- Golden `G01.asthma`: num 6
  - num: A01, A02, A03, A04, A05, K04
- Golden `G01.chronic_kidney_disease`: num 5
  - num: B03, K01, K02, K03, K04

## G02 — Under care

- Numerator: G01 with at least 1 visit in the past 12 months, with the exclusions of C01
- Denominator: Count
- Version: ind-0.1.0-draft (draft)
- Golden `G02.diabetes`: num 24
  - num: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X05, R03
- Golden `G02.hypertension`: num 35
  - num: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13
- Golden `G02.asthma`: num 5
  - num: A01, A02, A03, A04, A05
- Golden `G02.chronic_kidney_disease`: num 4
  - num: B03, K01, K02, K03

## G03 — New registrations

- Numerator: Registered for the condition in the month
- Denominator: Count
- Version: ind-0.1.0-draft (draft)
- Golden `G03.diabetes`: num 1
  - num: D13
- Golden `G03.hypertension`: num 1
  - num: H07
- Golden `G03.asthma`: num 1
  - num: A05
- Golden `G03.chronic_kidney_disease`: num 0
  - num: none

## G04 — Outcome at latest visit

- Numerator: Patients in each outcome class at the latest visit in the past 3 months, plus not recorded and no visit
- Denominator: Patients under care for the condition, registered before the past 3 months
- Version: ind-0.1.0-draft (draft)
- Golden `G04.diabetes`: den 22; in_range 8, moderately_raised 4, very_raised 3, not_classifiable 3, not_recorded 2, no_visit 2
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03
  - in_range: D01, D06, D09, D11, D14, B01, B03, B08
  - moderately_raised: D02, D03, D15, B07
  - very_raised: D04, D08, B02
  - not_classifiable: D05, B05, X05
  - not_recorded: D07, D16
  - no_visit: D10, R03
- Golden `G04.hypertension`: den 32; in_range 14, not_in_range 10, not_recorded 1, no_visit 7
  - den: H01, H02, H03, H04, H05, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13
  - in_range: H01, H08, H10, H12, H16, H17, B01, B03, B07, B08, A04, X05, R01, R10
  - not_in_range: H02, H03, H09, H11, H15, B02, B05, K02, R02, R13
  - not_recorded: H05
  - no_visit: H04, R04, R05, R06, R07, R11, R12
- Golden `G04.asthma`: den 4; controlled 1, partly_controlled 1, not_controlled 0, not_assessed 1, not_recorded 0, no_visit 1
  - den: A01, A02, A03, A04
  - controlled: A01
  - partly_controlled: A04
  - not_controlled: none
  - not_assessed: A02
  - not_recorded: none
  - no_visit: A03
- Golden `G04.chronic_kidney_disease`: den 4; controlled 1, partly_controlled 0, not_controlled 1, not_assessed 0, not_recorded 1, no_visit 1
  - den: B03, K01, K02, K03
  - controlled: B03
  - partly_controlled: none
  - not_controlled: K02
  - not_assessed: none
  - not_recorded: K01
  - no_visit: K03

## G05 — Lost to follow-up at 12 months

- Numerator: No visit in the past 12 months
- Denominator: G01
- Version: ind-0.1.0-draft (draft)
- Golden `G05.diabetes`: num 1, den 26
  - num: D12
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X03, X05, R03
- Golden `G05.hypertension`: num 2, den 40
  - num: H13, L02
  - den: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X02, X05, R01, R02, R04, R05, R06, R07, R09, R10, R11, R12, R13, L02
- Golden `G05.asthma`: num 0, den 6
  - num: none
  - den: A01, A02, A03, A04, A05, K04
- Golden `G05.chronic_kidney_disease`: num 0, den 5
  - num: none
  - den: B03, K01, K02, K03, K04

## G06 — Care cascade

- Numerator: Registered; under care; visit in past 3 months; leading class at latest visit in past 3 months
- Denominator: Each step as a percentage of G01
- Version: ind-0.1.0-draft (draft)
- Golden `G06.diabetes`: den 26; registered 26, under_care 24, visit_3_months 22, leading_class 9
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X03, X05, R03
  - registered: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X03, X05, R03
  - under_care: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X05, R03
  - visit_3_months: D01, D02, D03, D04, D05, D06, D07, D08, D09, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X05
  - leading_class: D01, D06, D09, D11, D14, B01, B03, B04, B08
- Golden `G06.hypertension`: den 40; registered 40, under_care 35, visit_3_months 28, leading_class 16
  - den: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X02, X05, R01, R02, R04, R05, R06, R07, R09, R10, R11, R12, R13, L02
  - registered: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H13, H14, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X02, X05, R01, R02, R04, R05, R06, R07, R09, R10, R11, R12, R13, L02
  - under_care: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X05, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13
  - visit_3_months: H01, H02, H03, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, B01, B02, B03, B04, B05, B07, B08, A04, K02, X05, R01, R02, R10, R13
  - leading_class: H01, H06, H08, H10, H12, H16, H17, B01, B03, B04, B07, B08, A04, X05, R01, R10
- Golden `G06.asthma`: den 6; registered 6, under_care 5, visit_3_months 4, leading_class 1
  - den: A01, A02, A03, A04, A05, K04
  - registered: A01, A02, A03, A04, A05, K04
  - under_care: A01, A02, A03, A04, A05
  - visit_3_months: A01, A02, A04, A05
  - leading_class: A01
- Golden `G06.chronic_kidney_disease`: den 5; registered 5, under_care 4, visit_3_months 3, leading_class 1
  - den: B03, K01, K02, K03, K04
  - registered: B03, K01, K02, K03, K04
  - under_care: B03, K01, K02, K03
  - visit_3_months: B03, K01, K02
  - leading_class: B03

## H01 — HbA1c tested

- Numerator: At least 1 HbA1c result in the past 12 months
- Denominator: Diabetes patients under care
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `H01`: num 6, den 24
  - num: D01, D05, D06, D08, D09, B02
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X05, R03

## H02 — Kidney review done

- Numerator: Creatinine and a urine protein test in the past 12 months
- Denominator: Patients under care holding a registration whose module lists the kidney component
- Version: ind-0.1.0-draft (draft)
- Golden `H02`: num 7, den 53
  - num: H01, D01, D11, B01, B02, B03, K01
  - den: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, A04, K01, K02, K03, X05, R01, R02, R03, R04, R05, R06, R07, R10, R11, R12, R13

## H03 — Eye examination done

- Numerator: Eye component with examined = yes in the past 12 months
- Denominator: Diabetes patients under care
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `H03`: num 5, den 24
  - num: D01, D09, D14, B01, B02
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X05, R03

## H04 — Foot examination done

- Numerator: Foot component recorded in the past 12 months
- Denominator: Diabetes patients under care
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `H04`: num 8, den 24
  - num: D01, D05, D06, D07, B01, B02, B03, X05
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, X05, R03

## H05 — Blood pressure controlled in diabetes

- Numerator: Below 140/90, and separately below 130/80, at the latest visit in the past 3 months
- Denominator: Diabetes patients under care, registered before the past 3 months
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `H05`: den 22; below_140_90 16, below_130_80 7
  - den: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D14, D15, D16, B01, B02, B03, B05, B07, B08, X05, R03
  - below_140_90: D01, D03, D05, D06, D07, D08, D09, D11, D14, D15, D16, B01, B03, B07, B08, X05
  - below_130_80: D01, D06, D08, D11, D14, B08, X05

## H06 — Statin on medicine list

- Numerator: Statin present at the latest visit in the past 12 months
- Denominator: Diabetes patients under care aged 40 or above
- Version: ind-0.1.0-draft (draft)
- Condition (named in the standard): diabetes
- Golden `H06`: num 8, den 22
  - num: D01, D04, D06, D11, B01, B02, B03, X05
  - den: D01, D02, D03, D04, D05, D06, D07, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, X05, R03

## H07 — Kidney category distribution

- Numerator: Patients in each G category and each A category
- Denominator: Patients with a kidney review in the past 12 months
- Version: ind-0.1.0-draft (draft)
- Golden `H07`: den 10; G1 2, G2 2, G3a 1, G3b 3, G4 0, G5 1, A1 2, A2 1, A3 3
  - den: H01, D01, D11, B01, B02, B03, B06, K01, K02, K03
  - G1: D01, D11
  - G2: H01, B01
  - G3a: B06
  - G3b: B02, K01, K02
  - G4: none
  - G5: B03
  - A1: H01, D01
  - A2: B06
  - A3: B02, B03, K01

## H08 — Event rates

- Numerator: Events in the past 12 months, by type and by admission reason
- Denominator: Per 1,000 patients under care at the as-of date
- Version: ind-0.1.0-draft (draft)
- Golden `H08`: den 57; pregnancy 1, dialysis_start 1, admission 6, admission:hypertensive_emergency 1, admission:diabetic_ketoacidosis 1, death 4, transfer_out 3, admission:acute_asthma 1, withdrawal 2, admission:stroke 1, stroke 1, admission:heart_failure 1, foot_ulcer_new 1, admission:foot_sepsis 1, amputation_major 1
  - den: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, A01, A02, A03, A04, A05, K01, K02, K03, X05, R01, R02, R03, R04, R05, R06, R07, R10, R11, R12, R13
  - pregnancy: H12
  - dialysis_start: B03
  - admission: B05, B06, A01, X01, X04, X05
  - admission:hypertensive_emergency: B05
  - admission:diabetic_ketoacidosis: B06
  - death: B06, X01, X04, R08
  - transfer_out: B07, X03, R09
  - admission:acute_asthma: A01
  - withdrawal: K04, X02
  - admission:stroke: X01
  - stroke: X01
  - admission:heart_failure: X04
  - foot_ulcer_new: X05
  - admission:foot_sepsis: X05
  - amputation_major: X05

## H09 — Medicines not obtained in full

- Numerator: Visits with partial or none, by reason
- Denominator: Visits where medicines obtained is not not-applicable
- Version: ind-0.1.0-draft (draft)
- Golden `H09`: num 3, den 20; stock_out 1, cost 1, other 1
  - num: B04, K02, R02
  - den: H02, H06, H07, H08, H17, D02, D08, D09, D13, B01, B04, B07, A04, A05, K02, X01, R01, R02, R10, R13
  - stock_out: B04
  - cost: K02
  - other: R02

## H10 — Completeness

- Numerator: Visits with all applicable every-visit core fields present
- Denominator: All non-historical visits in the month
- Version: ind-0.1.0-draft (draft)
- Golden `H10`: num 17, den 20
  - num: H02, H06, H07, H08, D02, D06, D08, D09, B01, B04, B07, A04, K02, R01, R02, R10, R13
  - den: H02, H06, H07, H08, D02, D06, D08, D09, D13, B01, B04, B07, A04, A05, K02, X01, R01, R02, R10, R13

## H11 — Same-day entry

- Numerator: Visits entered on the visit date
- Denominator: All non-historical visits in the month
- Version: ind-0.1.0-draft (draft)
- Golden `H11`: num 19, den 20
  - num: H02, H06, H07, H08, D02, D06, D09, D13, B01, B04, B07, A04, A05, K02, X01, R01, R02, R10, R13
  - den: H02, H06, H07, H08, D02, D06, D08, D09, D13, B01, B04, B07, A04, A05, K02, X01, R01, R02, R10, R13

## H12 — Care band distribution

- Numerator: Patients in each of the four bands
- Denominator: Patients under care with a diabetes or hypertension registration
- Version: ind-0.1.0-draft (draft)
- Golden `H12`: den 51; hypertension_only 25, diabetes_only 11, both_without_complications 5, either_with_complications 10
  - den: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H15, H16, H17, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D13, D14, D15, D16, B01, B02, B03, B04, B05, B07, B08, A04, K02, X05, R01, R02, R03, R04, R05, R06, R07, R10, R11, R12, R13
  - hypertension_only: H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H12, H16, H17, A04, R01, R02, R04, R05, R06, R07, R10, R11, R12, R13
  - diabetes_only: D01, D03, D06, D08, D10, D11, D13, D14, D15, D16, R03
  - both_without_complications: B01, B04, B05, B07, B08
  - either_with_complications: H15, D02, D04, D05, D07, D09, B02, B03, K02, X05
