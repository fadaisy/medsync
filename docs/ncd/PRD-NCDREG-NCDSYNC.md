# NCDReg and NCDSync: Product Requirements Document

Oct 5, 2026 · @Usama Fadhul

## 1. Summary

NCDReg is an open data standard for registering diabetes and hypertension at hospital level. NCDSync is the software that captures that standard during the clinic visit and gives back recall lists and dashboards. The first site is the Endocrinology and Non-Communicable Diseases (NCD) Department at Mengo Hospital, Kampala.

The product is built as the first working slice of the MedSync encounter engine, not as a separate system. This document is a draft for review. Targets and clinical thresholds are proposals until signed off.

Five positions this document takes, each open to challenge:

1. **Standard and software are separate.** NCDReg (the standard) is free and open. NCDSync (the software) is one implementation of it.
2. **Capture happens at the point of care.** The clinical team enters data during the visit. Data clerks handle legacy back-entry only.
3. **Version 1 covers adults aged 18 and above** with diabetes, hypertension, or both, seen in the outpatient NCD clinic. Admissions, dialysis and deaths are recorded as events.
4. **Recall comes before reporting.** The first output is the list of overdue patients, then the dashboards.
5. **The registry is a clinical record with governed secondary use.** Research access is de-identified and approved case by case. This position needs legal and ethics confirmation (section 10).

## 2. Problem and opportunity

A hospital in Uganda can say how many diabetes and hypertension visits it had last month. It cannot say how many of its patients are controlled, how many stopped coming, or how many reached dialysis. The draft Mengo protocol cites a 2018 assessment of 53 public facilities in which most kept no NCD registry at all.

Two existing models do not fit this gap.

|  | CanReg5 | Simple and the DHIS2 package | NCDReg and NCDSync |
| --- | --- | --- | --- |
| Built for | Cancer, population level | Hypertension and diabetes, primary care | Hypertension and diabetes, hospital level |
| Unit of record | One tumour, registered once | One patient, repeated visits | One patient, repeated visits, annual reviews and events |
| Who captures | Registrars, from records, after the fact | Health worker, during the visit | Clinical team, during the visit |
| Depth of data | Site, morphology, stage, vital status | Blood pressure, blood sugar, medicines, next visit | The same core, plus kidney, eye and foot review, admissions, dialysis, death |
| Main outputs | Incidence tables | Control and missed-visit rates, overdue list | The same, plus complication screening coverage and event rates |

Three lessons shape this product.

- **From CanReg5:** a registry earns trust through a fixed dataset, built-in validity checks, duplicate search and an owner for the standard.
- **From Simple:** data gets entered only when entry is fast. Simple reports a median of 13 seconds per follow-up visit ([simple.org](https://www.simple.org/about/)).
- **From the 2009 to 2011 Mbarara diabetes pilot:** a standalone database that clinical work does not depend on stops when the project stops.

The open lane is the hospital. Primary care tools leave out complications and outcomes on purpose. A department with an inpatient NCD ward and a dialysis unit sees exactly those.

## 3. Product definition and scope

The product has two parts with different owners and different lifespans.

**NCDReg, the standard.** A versioned package: data dictionary, code lists, validation rules, indicator definitions and export formats. Any system can implement it. It is owned by a Registry Technical Group, not by a software vendor (section 10).

**NCDSync, the software.** Capture screens, patient trajectory view, recall list, dashboards, data quality tools and exports. It runs on the MedSync platform and uses its sign-in, role-based access, audit log, encryption and SMS service.

### In scope for version 1

- Adults aged 18 and above with confirmed diabetes (type 1, type 2, other), hypertension, or both
- Outpatient NCD clinic visits
- Annual complication review: kidney, eye, foot, lipids
- Events: admission, stroke, heart attack, heart failure, foot ulcer, amputation, dialysis start, transfer, death
- Recall of overdue patients by phone call and SMS
- Department dashboards and a monthly report
- Aggregate export for Ministry of Health (MoH) reporting, and a de-identified research extract
- Back-entry of existing patients from paper or electronic records

### Out of scope for version 1

- **Treatment advice of any kind.** No dosing, no prescribing prompts, no risk-based recommendations. The product records and displays; clinicians decide.
- Children and adolescents under 18. Paediatric type 1 diabetes needs its own dataset.
- Gestational diabetes and hypertension first arising in pregnancy. Pregnancy in an already registered patient is recorded as an event.
- Other conditions seen in the department: thyroid disease, obesity alone, chronic kidney disease without diabetes or hypertension.
- Billing, pharmacy stock, laboratory ordering, full inpatient charting.
- A patient-facing app. Patients receive SMS only.
- Claims about incidence or prevalence in the population. A hospital registry describes the hospital's patients.

### Relationship to the rest of MedSync

- NCDSync is the first production slice of the MedSync encounter engine, limited to one visit type.
- The registry computes a **care band** for each patient using the same four groups as the Cardiometabolic Centre plans: hypertension only; diabetes only; both without complications; either with complications. Registry data can then size and price those plans.
- A partner hospital running NCDSync becomes a natural referral entry point for the centre's service catalogue.

## 4. Users and their jobs

Seven roles touch the registry inside the hospital. Each must get something back for what they put in.

| Role | What they need to do | What NCDSync gives them |
| --- | --- | --- |
| Triage nurse | Record weight, blood pressure and point-of-care glucose before the consultation | One short screen; values flow to the clinician's view |
| Clinician (physician, medical officer, clinical officer) | See where this patient is heading and record today's decisions | A trajectory strip of the last readings, medicines carried forward, visit closed in about a minute |
| Records or registry officer | Enrol patients, prevent duplicates, back-enter old files, call overdue patients | Search-before-create, a daily call list, call outcomes in two taps |
| Registry lead (a named physician) | Guard data quality and sign off the monthly report | Completeness scores, query lists, duplicate review, an audit sample |
| Head of department | Know control, retention and screening coverage; argue for staff and supplies | A department dashboard and cohort report |
| Ward and dialysis unit staff | Report admissions, dialysis starts and deaths | A quick event form reachable from any unit |
| Hospital administrator and records department | Submit MoH returns; plan services | Aggregates ready for the monthly report |

Three parties sit outside the hospital.

- **Patients** receive appointment reminders and a call when they miss a visit.
- **Researchers** at Uganda Christian University receive de-identified extracts through an approval process.
- **The MoH NCD programme** receives aggregate indicators only.

## 5. Product principles

Every requirement below is tested against these nine rules. A requirement that breaks one is cut or rewritten.

1. **By-product of care.** Every field entered is shown back to a clinician at this visit or the next. Nothing is collected only for the registry.
2. **A field must earn its place.** It enters the standard only if it feeds a named indicator or a named clinical display.
3. **Speed is a requirement.** Follow-up visit capture takes 60 seconds or less. Enrolment takes 3 minutes or less.
4. **Standard before software.** Definitions are versioned and signed off first. The software conforms to them.
5. **Recall before reporting.** The overdue list ships before any chart.
6. **Engine first.** No screen is built before its tables, access policies and tests exist.
7. **Record, do not advise.** Version 1 validates data and flags overdue items. It never suggests treatment.
8. **Least data, least access.** Identifiers are encrypted, access follows role, every view of a record is logged.
9. **No lock-in.** The hospital can export all its data in open formats at any time.

## 6. NCDReg data standard

The standard has five record types and a dataset in four tiers, set by how often each item is captured. This section fixes the shape. The field-level data dictionary (NCDReg version 0.1) is a separate deliverable.

### Record types

- **Person.** One per patient: identifiers, contacts, residence.
- **Registration.** One per condition per person: diabetes or hypertension, with date and basis of diagnosis.
- **Visit.** One per clinic attendance: measurements, medicines, next appointment.
- **Annual review.** One per 12 months: complication screening.
- **Event.** One per occurrence: admission, new complication, transfer, death.

Every record keeps the unit that reported it and the user who entered it. This is the CanReg idea of a source record, kept so that one patient reported by clinic, ward and dialysis unit stays one patient.

### Dataset tiers

| Tier | When | Field groups |
| --- | --- | --- |
| Enrolment | Once | Hospital number; registry number (system-issued); national ID number if available, never required; name; sex; date of birth or estimated age; two phone numbers; next-of-kin phone; residence to village. For each condition: type, year of diagnosis, basis of diagnosis, where first diagnosed, referral source. Baseline: height, tobacco, alcohol, known cardiovascular disease, known kidney disease, family history |
| Every visit | Each attendance | Visit type; weight, with body mass index calculated; blood pressure, two readings where possible; glucose value and type (fasting, random, after meal); glycated haemoglobin (HbA1c) when resulted; current medicines by class, carried forward from the last visit; missed doses in the past 7 days; hypoglycaemia since last visit (diabetes only); medicines obtained in full, in part or not at all, with reason; next appointment date |
| Annual review | Every 12 months | Kidney: serum creatinine with estimated glomerular filtration rate (eGFR) calculated, and urine albumin-to-creatinine ratio or dipstick protein. Eyes: examined or not, method, retinopathy grade. Feet: sensation, pulses, ulcer, amputation, risk category. Lipids: total cholesterol, and low-density lipoprotein where available. Cardiovascular risk category as recorded by the clinician. Electrocardiogram if done |
| Events | As they occur | Admission and its main reason (diabetic ketoacidosis, hyperosmolar state, severe hypoglycaemia, hypertensive emergency, stroke, acute coronary syndrome, heart failure, foot sepsis, other); new complication; dialysis start; pregnancy; transfer out; death with date, place and cause if known |

Two items in the draft protocol's list are moved out of the core. Presenting symptoms and duration is free text that feeds no indicator. Waist circumference becomes optional.

### Coding and classification

| Item | Proposed standard |
| --- | --- |
| Diagnoses | International Classification of Diseases, 11th revision, with a cross-map to the 10th. MoH reporting requirement to be confirmed |
| Medicines | Generic names as in the Essential Medicines and Health Supplies List for Uganda, grouped by Anatomical Therapeutic Chemical class |
| Laboratory tests | LOINC codes. Units: mmol/L for glucose and lipids, µmol/L for creatinine, per cent for HbA1c with mmol/mol stored alongside |
| Kidney function | KDIGO categories G1 to G5 and A1 to A3; eGFR by the 2021 CKD-EPI creatinine equation |
| Retinopathy | International Clinical Diabetic Retinopathy severity scale |
| Foot risk | International Working Group on the Diabetic Foot categories 0 to 3 |
| Hypertension grade | As defined in the Uganda Clinical Guidelines 2023 |
| Residence | Uganda Bureau of Statistics hierarchy to parish, with village as free text |

Every classification in this table needs Clinical Safety Officer and Technical Group sign-off before build.

### Patient status

Status is computed, not typed: active, overdue, lost to follow-up. Three statuses come from a recorded event: transferred out, died, withdrawn.

### Validation rules

- **Range checks.** Values outside a plausible range ask for confirmation and are never blocked. Example: systolic pressure 60 to 300 mmHg, and systolic above diastolic.
- **Date logic.** No future dates. Birth precedes diagnosis. No visit after a recorded death.
- **Consistency queries.** Mismatches go to the registry lead's query list, not to the clinician as an alert. Example: type 1 diabetes with no insulin recorded.
- **Duplicate check at enrolment.** Name similarity, sex, birth year, phone and hospital number are compared before a new person is created.

## 7. Indicators

The core indicators copy the HEARTS360 definitions without change, so Mengo's results can be compared with programmes elsewhere. HEARTS360 is the open dashboard specification built on the World Health Organization (WHO) HEARTS package ([hearts360.org](https://hearts360.org/)). The hospital-level indicators are additions specific to NCDReg.

### Core indicators, comparable with other programmes

| Indicator | Numerator | Denominator |
| --- | --- | --- |
| Patients under care | Registered patients with at least 1 visit in the past 12 months | A count. Patients who died are excluded |
| Blood pressure controlled | Below 140 systolic and below 90 diastolic at the latest visit in the past 3 months | Hypertension patients under care, registered before the past 3 months |
| Blood pressure not controlled | 140 or above systolic, or 90 or above diastolic, at the latest visit in the past 3 months | Same |
| No visit in past 3 months | No visit recorded in the past 3 months | Same |
| Blood sugar controlled | Fasting glucose below 7.0 mmol/L or HbA1c below 7% at the latest visit in the past 3 months | Diabetes patients under care, registered before the past 3 months |
| Blood sugar not controlled | Two bands: fasting glucose 7.0 to 11.0 mmol/L or HbA1c 7 to 8.9%; fasting glucose 11.1 mmol/L or above, or HbA1c 9% or above | Same |
| Lost to follow-up at 12 months | No visit in the past 12 months | All registered patients, excluding those who died |
| Overdue patients | Scheduled visit date has passed with no visit, counted on the 1st of the month | Patients under care |
| Overdue patients called | Overdue patients called during the month | Overdue patients on the 1st of the month |
| Returned to care | Returned within 15 days of the first call | Overdue patients called |
| Quarterly cohort outcome | Controlled, not controlled, or no visit, at the latest visit in the following quarter | Patients registered in a given quarter |

### Hospital-level indicators, added by NCDReg

| Indicator | Numerator | Denominator |
| --- | --- | --- |
| HbA1c tested | At least 1 HbA1c result in the past 12 months | Diabetes patients under care |
| Kidney review done | Creatinine and a urine protein test in the past 12 months | All patients under care |
| Eye examination done | Retinal examination in the past 12 months | Diabetes patients under care |
| Foot examination done | Foot examination in the past 12 months | Diabetes patients under care |
| Blood pressure controlled in diabetes | Below 140/90, and separately below 130/80 | Diabetes patients under care, registered before the past 3 months |
| Statin prescribed | Statin on the medicine list at the latest visit | Diabetes patients under care aged 40 and above |
| Kidney stage distribution | Patients in each KDIGO category | Patients with a kidney review in the past 12 months |
| Event rates | Admissions by reason, strokes, amputations, dialysis starts, deaths | Per 1,000 patients under care per year |
| Medicines not obtained in full | Visits where the patient left without the full prescription, by reason | All visits with a prescription |
| Data quality | Complete every-visit records; records entered the same day; duplicates found | All visits; all persons |

Three cautions on reading these numbers.

- **A control threshold is a monitoring definition, not a treatment target.** Individual targets stay with the clinician and the Uganda Clinical Guidelines.
- **The 3-month window assumes visits at least every 3 months.** Stable hospital patients on longer refills would be miscounted as missed. The overdue indicator, based on the scheduled date, corrects for this.
- **A random glucose alone cannot classify control under these definitions.** How to count those visits is an open decision (section 15).

WHO's facility-based monitoring guidance sets 22 core and 59 optional NCD indicators for primary care ([published summary, 2025](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12269858/)). Version 0.1 of the standard will map each NCDReg indicator to that list where they overlap.

## 8. Functional requirements

NCDSync has nine modules and 44 requirements. Each requirement carries the release it belongs to: R1, R2 or R3 (section 13).

### A. Enrolment and identity

- **A1.** A new person cannot be created until a search by name, phone or hospital number has run. (R1)
- **A2.** Possible duplicates are shown with the matching fields; the user links to one or confirms a new person. (R1)
- **A3.** No identifier is mandatory except the system-issued registry number. (R1)
- **A4.** One person can hold a diabetes and a hypertension registration, added on different dates. (R1)
- **A5.** Privacy notice acknowledgement and SMS preference are recorded at enrolment. (R1)
- **A6.** Back-entered historical visits are flagged and kept out of capture-time and same-day-entry metrics. (R1)
- **A7.** Merging two person records needs a second approver and is fully logged. (R2)

### B. Visit capture

- **B1.** One screen per visit in two parts: nurse measurements and clinician entries. Either role can complete both. (R1)
- **B2.** Before entry, the screen shows a trajectory strip: the last 6 blood pressures, glucose values, HbA1c results and weights, and the latest eGFR, each with its date. (R1)
- **B3.** Medicines carry forward from the last visit for the user to confirm or edit. (R1)
- **B4.** A visit cannot be closed without a next appointment date, or an explicit transfer or discharge. (R1)
- **B5.** Capture works offline and syncs when the connection returns. (R1)
- **B6.** Review items that are due (HbA1c, kidney, eye, foot) appear as neutral "due" markers. No treatment prompts. (R1)
- **B7.** Laboratory results can be added to a visit later without reopening the clinical entries. (R2)

### C. Annual review

- **C1.** Structured forms for kidney, eye, foot and lipids, each completable on a different day. (R2)
- **C2.** eGFR and kidney category are calculated from creatinine, age and sex; the formula version is stored with the result. (R2)
- **C3.** A list shows patients whose review falls due in the next 30 days. (R2)

### D. Events

- **D1.** Death or transfer can be recorded from the patient record or from a call outcome; it ends active status and stops all reminders at once. (R1)
- **D2.** An event form is reachable from any unit and needs only the person, the event type and the date. (R2)
- **D3.** Admissions carry a main reason from the coded list in section 6. (R2)

### E. Recall

- **E1.** A daily overdue list, ordered by days overdue and by control status at the last visit. (R1)
- **E2.** Call outcomes are logged in two taps: will return, call later, moved or transferred, died, wrong number, declined. (R1)
- **E3.** SMS reminders go out before an appointment and after a missed one; timing is configurable. (R2)
- **E4.** SMS text never names a disease, a medicine or the department. (R2)
- **E5.** Templates exist in English and Luganda at minimum, and each translation is reviewed before use. (R2)
- **E6.** A patient's opt-out takes effect immediately. (R2)

### F. Dashboards and reports

- **F1.** Department dashboard with the core indicators from section 7 and their monthly trend. (R1)
- **F2.** Every number opens the patient list behind it, for authorised roles only. (R1)
- **F3.** Hospital-level indicators and the quarterly cohort report. (R2)
- **F4.** A clinician's own panel: my patients not controlled, overdue, or due for review. (R2)
- **F5.** A monthly report generated for the registry lead to sign. (R2)
- **F6.** Filters by condition, sex, age band, district and care band. (R2)

### G. Data quality

- **G1.** A completeness score per visit, visible to the person entering it. (R1)
- **G2.** Every edit is versioned; nothing is overwritten silently. (R1)
- **G3.** A query list for the registry lead, fed by the consistency rules. (R2)
- **G4.** A monthly random sample of 5% of visits is drawn for checking against the source. (R2)

### H. Exchange

- **H1.** Monthly aggregates in a form the MoH health information system (DHIS2) accepts. (R3)
- **H2.** Patient-level export as HL7 FHIR R4 resources. (R3)
- **H3.** De-identified research extract; each release is tied to an approval record and small counts are suppressed. (R3)
- **H4.** Full export of the hospital's own data on request, with the data dictionary. (R3)
- **H5.** Import of legacy data from a spreadsheet template. (R3)

### I. Administration

- **I1.** Roles: triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor. (R1)
- **I2.** Code lists are versioned and change only with registry lead sign-off. (R1)
- **I3.** SMS templates, reminder timing and default appointment intervals are configurable per site. (R2)

## 9. Non-functional requirements

These are pass or fail conditions for release, measured on real clinic days and not on a developer's machine.

| Area | Requirement |
| --- | --- |
| Capture speed | Median follow-up visit entry of 60 seconds or less; median enrolment of 3 minutes or less |
| Responsiveness | Any screen usable within 2 seconds on the clinic's network |
| Offline | Enrolment, visit capture and the overdue list work with no connection; sync is automatic and loses nothing |
| Devices | Low-cost Android tablet or phone, and a desktop browser |
| Availability | 99.5% during clinic hours; daily encrypted backup; a restore tested every quarter |
| Access control | Row-level policies on every table; multi-factor sign-in for clinical and administrative roles |
| Encryption | Identifiers encrypted at application level, in addition to encryption in transit and at rest |
| Audit | Append-only log of every view, create and edit of an identifiable record; no role can alter it |
| Display rules | Never colour alone to carry meaning; red, amber and green reserved for clinical signals, as in the MedSync design system |
| Correctness | Every indicator is tested against a fixed reference dataset with known answers before each release |
| Language | English interface; SMS in English and Luganda first |

The security requirements restate standing MedSync rules. They are listed here so a hospital reviewer can read this document on its own.

## 10. Clinical safety, privacy and governance

Three gates stand between this document and a live registry: clinical sign-off, a lawful basis for the data, and a written agreement on who owns what. None is settled yet.

### Clinical safety

- The Clinical Safety Officer signs off every code list, threshold, formula, indicator definition, SMS text and clinician-facing screen before release.
- The product records and reminds. It does not diagnose, stratify risk or advise. Any later feature that does is a separate decision with its own safety case.
- MedSync has a known gap: one person holds the Clinical Safety Officer, superadmin and audit reviewer roles. For NCDReg, all clinical content is co-signed by the Registry Technical Group, so no definition rests on one signature.
- A hazard log opens with the first build. Starting entries: record linked to the wrong patient; wrong value in the trajectory strip; reminder sent after a death; SMS that reveals a diagnosis; error in a calculated value.

### Registry Technical Group

The group owns the standard, approves changes to it, signs the monthly report and decides data access requests. Proposed members: the head of the NCD department as chair, a physician, the dialysis lead, a nurse, the records lead, the hospital's data protection lead, a Uganda Christian University School of Medicine representative, and an MoH NCD programme observer.

### Privacy and lawful basis

Health information is special personal data under Uganda's Data Protection and Privacy Act 2019. The proposal is one basis per use.

| Use | Proposed basis | Patient's choice |
| --- | --- | --- |
| Care record and recall | Part of the hospital's medical record; a privacy notice is given at enrolment | Can decline SMS and calls |
| Department reports and MoH aggregates | Routine service management; no identifiable data leaves the hospital | Not applicable |
| Research | De-identified extract under an ethics-approved protocol | Identifiable use only with individual consent |

The draft protocol says informed consent will be obtained from all participants before data collection. For interviews and focus groups that is right. For registry entry it would leave out every patient who declines or is not asked, and bias every indicator.

Before any patient is enrolled:

- [ ] Legal counsel confirms the basis for each use
- [ ] Mengo Hospital Research and Ethics Committee and the Uganda National Council for Science and Technology approve the research component
- [ ] Registration with the Personal Data Protection Office is confirmed for the hospital and for MedSync
- [ ] A data protection impact assessment is completed
- [ ] The hosting location is decided, with the Act's conditions on storage outside Uganda checked

### Ownership

- Mengo Hospital controls its patients' data. MedSync processes it on the hospital's instructions. The university accesses it only through the approval process.
- The NCDReg standard is published under an open licence and belongs to the Technical Group.
- These points go into a signed agreement before any build beyond the standard itself.
- The protocol's competing interests statement must declare any author's stake in MedSync.

## 11. Architecture and MedSync fit

NCDSync is one visit type on the MedSync encounter engine, plus a registry layer that computes status and indicators from what the clinic records.

&#91;embedded content: data flow · capture, registry engine, outputs\]

Data moves left to right. The lower arrow is why staff keep entering it: what they record comes back as something they use at the next visit.

### Why this is the first slice of the encounter engine

- The encounter engine is not built yet. An NCD follow-up visit is the narrowest real encounter: few fields, repeated often, easy to measure.
- Building it first proves the engine's tables, access policies, offline sync and audit under real clinic load, before general clerking depends on them.
- The move from the local development database to native Postgres was deferred until the encounter engine build begins. This build is that trigger.

### Core tables

Person (the existing MedSync patient), registration, visit, observation, medicine snapshot, annual review, clinical event, appointment, recall action, code list with versions, indicator snapshot, and the existing audit log.

Three design rules:

- **Observations are typed rows** (code, value, unit, time), not wide columns. A new condition later adds codes, not tables.
- **Indicators are database views with a monthly snapshot.** A signed report does not change when a record is corrected afterwards; the correction shows in the next month.
- **Calculated values store their formula version.** This covers body mass index, eGFR, kidney category and care band.

### Capture modes

| Mode | When it applies | Consequence |
| --- | --- | --- |
| A. Native capture | The clinic works on paper today | NCDSync replaces the paper clinic card. This is the assumed mode |
| B. Alongside an existing system | The clinic already uses an electronic record | NCDSync must import from that system, or staff enter everything twice. An interface study comes before any commitment |

### Exchange

- MoH aggregates start as a file the records department uploads to DHIS2. A direct connection waits for agreement with the MoH Division of Health Information.
- Patient-level exchange uses HL7 FHIR R4. The field-to-resource mapping is part of the standard.

### Build method

Each release goes through the MedSync gated build prompts: tables, policies and tests first, then screens, with a stop and a real check at every gate.

## 12. Success metrics

Success is judged on the five RE-AIM dimensions the protocol already uses: Reach, Effectiveness, Adoption, Implementation, Maintenance. Targets are proposals for the 12-month pilot.

| Dimension | Metric | Proposed target |
| --- | --- | --- |
| Reach | Eligible NCD clinic patients enrolled | 80% by month 6; 90% by month 12 |
| Effectiveness | Visits with all every-visit core fields complete | 90% |
| Effectiveness | Diabetes patients with an HbA1c in the past 12 months | Above the baseline audit figure, reported monthly |
| Effectiveness | Blood pressure and blood sugar control | Reported monthly; no fixed target in year 1 |
| Adoption | Clinic days with every visit entered the same day | 90% |
| Adoption | Trained staff who enter data at least weekly | 90% |
| Implementation | Median follow-up capture time | 60 seconds or less |
| Implementation | Overdue patients called within 7 days | 80% |
| Maintenance | Registry still in routine use 6 months after study funding ends, with no study-paid data entry | Yes |

Baselines come from the records audit in the protocol's Exploration phase.

Control rates carry no target in year 1 on purpose. A new registry usually shows control to be worse than assumed, because it counts patients who were previously invisible. A target at that point rewards under-recording.

## 13. Release scope

Four releases, each with a gate that must pass before the next begins. Dates belong to the build plan that follows this document.

| Release | Contents | Exit gate |
| --- | --- | --- |
| R0. Standard | NCDReg version 0.1: data dictionary, code lists, validation rules, indicator definitions | Signed by the Technical Group and the Clinical Safety Officer |
| R1. Core registry | Enrolment, visit capture with trajectory strip, death and transfer status, overdue list with call outcomes, core dashboard with drill-down, completeness score, edit history, roles | On 5 consecutive clinic days, capture time and completeness targets are met; all access-policy and indicator tests pass |
| R2. Recall and review | SMS reminders, annual review forms, event forms, hospital-level indicators, cohort report, query list and audit sample, monthly report | SMS wording signed off; hazard log reviewed; 3 monthly reports signed by the registry lead |
| R3. Exchange | MoH aggregates, FHIR export, research extract, legacy import, full data export | MoH format accepted; first approved data release completed |

Deferred to a later document: a second hospital; further conditions such as chronic kidney disease, heart failure and asthma; a link to the patient app; a laboratory interface.

## 14. Risks and mitigations

The risk most likely to end the registry is double entry. The rest follow in rough order of likelihood.

| Risk | Mitigation |
| --- | --- |
| Staff enter the same data twice, on paper or another system and in NCDSync, and stop | Settle the capture mode first. NCDSync replaces the clinic card or imports from the existing system; it never sits beside it |
| Clinic is too busy for data entry | Speed budget as a release gate; nurse captures measurements before the consultation; medicines carry forward |
| Registry depends on study-paid data clerks | Clerks do back-entry only. From go-live, the clinical team enters every new visit |
| Deaths and transfers go unrecorded, so retention figures mislead | Call outcomes capture them; next-of-kin phone at enrolment; ward and dialysis unit report events |
| HbA1c, urine albumin and eye examination are unaffordable or unavailable for many patients | Accept fasting glucose and dipstick protein; report test coverage as an indicator in its own right |
| A privacy breach or a finding of non-compliance | The gates in section 10; encryption; audit log; SMS that reveals nothing |
| Scope grows into a full electronic record | The out-of-scope list in section 3; any addition needs a change to this document |
| One engineer builds, maintains and signs off clinical safety | Narrow R1; Technical Group co-signs clinical content; a named second approver for sensitive actions |
| Power or network failure on clinic days | Offline capture; battery-backed tablets |
| Unclear ownership between hospital, university and MedSync stalls the project | Signed agreement before any build beyond R0 |
| Local changes to indicator definitions break comparability | Core definitions are locked to HEARTS360; local additions sit in a separate table |

## 15. Open decisions

Thirteen decisions need an owner's answer before build. The first five block everything else.

**Blocking**

- [ ] What does the NCD clinic record visits in today: paper files, or an electronic system? This decides the capture mode.
- [ ] Who enters data during the visit, and on which devices? Who pays for the devices?
- [ ] Which lawful basis and consent model applies to each use of the data?
- [ ] What goes into the agreement between Mengo Hospital, the university and MedSync on data control and ownership of the standard?
- [ ] Who funds the build, and can study funds pay for software?

**Clinical, for the Technical Group**

- [ ] How is glycaemic control counted when only a random glucose is available?
- [ ] Which hypertension grading scheme is stored, and are individual targets recorded per patient?
- [ ] Is HIV status included as a comorbidity field? It is clinically relevant and highly sensitive.
- [ ] When do paediatric diabetes and pregnancy-related conditions enter scope?
- [ ] Who chairs the Technical Group and who sits on it?

**Technical and positioning**

- [ ] Where is the data hosted?
- [ ] Which disease classification version does MoH reporting require?
- [ ] Is NCDSync presented as a MedSync module or under its own name, and under which licence is the software released?

## 16. References

**Opened and used for this draft**

- Draft protocol: *The NCDReg and NCDSync: A Mixed-Methods Protocol for Building Uganda's First Hospital-Based Registry for Diabetes and Hypertension, at Mengo Hospital, Kampala* (confidential draft supplied by the author)
- [HEARTS360 hypertension dashboard and data definitions](https://hearts360.org/)
- [HEARTS360 diabetes dashboard](https://hearts360.org/diabetes)
- [Simple: about the project](https://www.simple.org/about/)
- [DHIS2 package for hypertension and diabetes](https://github.com/simpledotorg/dhis2-hypertension-package)
- [CanReg5, International Association of Cancer Registries](https://iacr.com.fr/index.php?Itemid=445&catid=68&id=9%3Acanreg5&option=com_content&view=article)
- [WHO noncommunicable disease facility-based monitoring guidance](https://www.who.int/publications/b/65516), and its [published summary](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12269858/)

**Named in this draft but not yet checked line by line**

- Uganda Clinical Guidelines 2023, for hypertension grading and treatment targets
- Data Protection and Privacy Act 2019 and its regulations, for lawful basis, registration and storage outside Uganda
- KDIGO chronic kidney disease guideline, the International Clinical Diabetic Retinopathy scale, and the International Working Group on the Diabetic Foot risk categories
- MoH health information reporting forms for NCD indicators

The second list must be verified before the standard is signed.
