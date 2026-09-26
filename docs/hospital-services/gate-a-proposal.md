# Departments & services hub — GATE A proposal

**Status: SIGNED.** The owner and CSO, Fadhul, gave a blanket sign-off on every GATE A decision on 26 Sep 2026. In the owner's words: "I have signed off everything … at the end deploy." The signature block is at the end. Repo-driven changes to the prompt are marked **Δ**.

This document is the build spec. Where it doesn't change them, the prompt's §5 wireframes stand, with the deltas below.

---

## 1. The reuse map: one store per fact

| Fact                                                               | Single store                                                                                                                                                        | New or reused                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Departments, units (IM sub-specialties, lab sections)              | `hospital_departments` (+ `kind`, `catalogue_code`, `medsync_live_at`, `archived_at`, `is_start`, `place_id`, `service_hours`)                                      | **reused, extended**                                                                                |
| Start department                                                   | `hospital_departments.is_start` (one per hospital). The application junction stays as history.                                                                      | reused **Δ** (moves off the application)                                                            |
| Head of department (and lab-section in-charge = head of that unit) | `department_heads` (effective-dated, acting allowed)                                                                                                                | new                                                                                                 |
| Wards                                                              | `hospital_wards` (+ `ward_type`, `sex`, `age_group`, `place_id`, `closed_at/closed_reason/expected_reopen_on`, `archived_at`)                                       | reused, extended                                                                                    |
| Ward in-charge                                                     | `ward_in_charge_assignments` (0031) + `acting`                                                                                                                      | **reused** **Δ** (the prompt expected a new table)                                                  |
| Beds (optional register)                                           | `hospital_beds`                                                                                                                                                     | new                                                                                                 |
| Places                                                             | `hospital_places` (building, floor, room, directions ≤ 140)                                                                                                         | new                                                                                                 |
| Clinics                                                            | `service_lines` (+ `catalogue_code`, `audience`, `place_id`, `unit_id`). The confidential flag already exists.                                                      | **reused, extended** (E-SVC-02: plain columns, since Desk and patient booking share the one schema) |
| Clinic days                                                        | `session_templates` (+ `repeat_every_weeks`, `nth_weekday`, `runs_on_holidays`, `place_id`). A one-off session is a template valid for a single day.                | reused, extended                                                                                    |
| Session instances                                                  | `clinic_sessions` (unchanged). Cancel/close goes through `ha-cancel-session`.                                                                                       | reused                                                                                              |
| Public holidays                                                    | `public_holidays` (reference data, seeded 2026–2027, source recorded)                                                                                               | new (none existed)                                                                                  |
| Closures                                                           | `service_closures` (scope + dates + reason). Sessions are cancelled through `ha-cancel-session`.                                                                    | new (no blackout store existed)                                                                     |
| Test menu                                                          | `diagnostic_offerings` (kind `lab`, code = **`loinc_codes.code`**: the ordering side's catalogue)                                                                   | new overlay on an existing catalogue                                                                |
| Imaging and other tests                                            | `diagnostic_offerings` (kind `imaging`, code from catalogue A.4)                                                                                                    | same table                                                                                          |
| Emergency pathway values                                           | `hospitals` columns (`emergency_capability`, `pre_alert_enabled` + `board_owner_note`, `emergency_sms_number`, `ambulance_number`, `emergency_entrance_directions`) | **reused** (CAP-2). The hub is their editor.                                                        |
| Other capabilities, OPD hours                                      | `capability_values` (typed key catalogue; one row per key; verified + pending value)                                                                                | new                                                                                                 |
| Four-eyes state for routing keys (including the pathway's keys)    | `capability_values.pending_*` / `verified_*`                                                                                                                        | new **Δ** (the superadmin four-eyes table is superadmin-only and has no confirmer)                  |
| Availability                                                       | `availability_events` (append-only) plus a pure projection. Closed wards, closures and cancelled sessions are merged in when read (AV-3).                           | new                                                                                                 |
| Presets                                                            | Versioned **data files** carrying source, page and signature (E-SVC-05)                                                                                             | new, no table                                                                                       |
| One-time legacy import decision                                    | `hospital_services_state`                                                                                                                                           | new (one row per hospital)                                                                          |
| Audit                                                              | `sa_audit_log` (Edge Function, fail-closed) **and** the `audit_log_changes()` row trigger on every new table                                                        | reused                                                                                              |

**The EMR seam.** The concurrent `feat/emr-engine` 0071 adds `test_catalogue` (with per-hospital rows) and `facility_capabilities`. When EMR merges:

- its per-hospital test rows read the hub's offerings, joined **by code**;
- `facility_capabilities` reads the availability projection.

The EMR session is told this (§9).

## 2. Schema diff: migration `0080_hospital_services_hub.sql` (GATED, additive)

**Δ numbering.** EMR holds 0071–0072, so the hub takes 0080.

**Existing tables, columns added:**

- `hospital_departments`:
  - `kind` (clinical | diagnostic | support | administrative, default clinical), `catalogue_code`, `medsync_live_at`, `archived_at`, `is_start`, `place_id`, `service_hours` (≤ 60).
  - Partial unique index: one `is_start` per hospital.
  - CHECKs: a start department is top-level, live and not archived.
  - **Backfill:**
    - `medsync_live_at = created_at` for every existing row, because every department is visible today. No reader changes behaviour.
    - `catalogue_code` from the slug.
    - `is_start` from the application's `is_primary`.
- `hospital_wards`:
  - `ward_type`, `sex`, `age_group` (CHECK lists from A.5 and §5.4), `place_id`, `closed_at`, `closed_reason`, `expected_reopen_on`, `archived_at`.
- `ward_in_charge_assignments`:
  - `+ acting`.
  - The "one open row per ward" index becomes one per (ward, acting).
- `service_lines`:
  - `catalogue_code`, `audience` (patients | referral | staff, default patients), `place_id`, `unit_id`.
- `session_templates`:
  - `repeat_every_weeks` (1–8, default 1), `nth_weekday` (1–5 or −1 = last, nullable), `runs_on_holidays` (default false), `place_id`.
- `sa_audit_log.action`:
  - The 0070 list verbatim, plus the hub's verbs (§8).

**New tables:**

- `hospital_places`, `hospital_beds`, `department_heads`.
- `diagnostic_offerings`, `capability_values`, `availability_events`.
- `public_holidays`, `service_closures`, `hospital_services_state`.

**Rules on every new table:**

- RLS on, and FORCE.
- `audit_log_changes()` trigger.
- `set_updated_at()` where there is an `updated_at`.
- **No client writes.**
- `availability_events` is append-only (`block_modify_append_only`).
- `public_holidays` can be read by anon and authenticated users.
- The hub tables can be read by `hospital_admin` of that hospital, by superadmins, and by staff of that hospital (`public.is_active_clinical_staff` or an affiliation check).

## 3. Engines: where each rule lives

- **Pure rules** (Deno-importable, imported by Vitest directly as `slots.ts` is):
  - `supabase/functions/_shared/services-rules.ts`: STR-2/4/5, CLN-3/4 skip, AV-1/2 projection, CAP-4/5, PS-2/3.
  - `supabase/functions/_shared/services-catalogue.ts`: Appendix A, the capability keys and the presets.
  - `slots.ts` `expandSessionTemplate` gains recurrence and a `skip(date)` hook (defaults keep today's behaviour byte-for-byte).
- **Mutations:**
  - One Edge Function, `ha-services-hub`, with a Zod discriminated union of ops. Each op follows the contract's order: Zod → auth → role → scope → **audit first** → mutation → log.
  - **Δ** One function, not ~30. The shape per op is identical, and it deploys once.
- **Clinics and templates** go through the booking engine's own functions, extended rather than copied:
  - `ha-upsert-service-line`: + catalogue code, audience, place, unit.
  - `ha-upsert-session-template`: + recurrence, holidays, closures, place.
- **Emergency fields:** `ha-set-hospital-emergency-settings` keeps coordinates and **refuses changes to routing fields**. Those change only through hub pending → verify (CAP-5).
- **Reads (Node):** `lib/services/*`, covering queries, the capability profile, the standards comparison and `getOrderingAvailability`.

## 4. Catalogues (Appendix A, corrected against the repo)

- **A.1 Departments (30):**
  - The 23 existing codes, all clinical, from `app/signup/hospital/_lib/catalog.ts`. Internal Medicine's 13 sub-specialties are units, **ids unchanged** (STR-6).
  - Added:
    - diagnostic: `LABORATORY`, `RADIOLOGY_IMAGING`;
    - support: `PHARMACY`, `NUTRITION_DIETETICS`, `MORTUARY`;
    - administrative: `RECORDS_HEALTH_INFO`, `RECEPTION_FRONT_DESK`.
  - The canonical list moves into `_shared/services-catalogue.ts`. The signup catalogue re-exports the 23 clinical ones, so the application form is unchanged.
- **A.2 Clinics (27):**
  - The 9 existing application codes, kept verbatim: diabetes, hypertension_cardiac, renal_dialysis, oncology, hiv_art **C**, tb **C**, antenatal_maternal, asthma_copd, mental_health **C**.
  - 18 added: general_medical_opd, surgical_opd, paediatric_opd, sickle_cell, epilepsy_neurology, family_planning **C**, srh **C**, immunisation, nutrition, eye, ent, dental, orthopaedic, skin, physiotherapy, palliative_care, postnatal, gynaecology.
  - Each clinic carries a default department. **C** = confidential by default (D-SVC-08, signed).
- **A.3 Laboratory sections (8):** clinical_chemistry, haematology, microbiology, parasitology, serology_immunology, molecular, blood_transfusion, histopathology_cytology. They are units of `LABORATORY`.
- **A.4 Imaging and other tests (11):** xray, ultrasound, ct, mri, mammography, fluoroscopy, ecg, echo, endoscopy, eeg, spirometry.
- **A.5 Ward types (11)**, **A.6 availability reasons (7)**: as in the prompt.
- **A.7 Capability keys:**
  - **Δ** The pathway's own 3-state `emergency_capability` (none / daytime / 24 h) replaces the yes/no `ed_open_24h`, so the routing store isn't lossy.
  - Routing (R) keys:
    - pathway keys: `emergency_capability`, `accepts_pre_alerts`, `emergency_sms_number`, `ambulance_line`, `arrival_directions`;
    - hub keys: `resus_bays`, `emergency_theatre_24h`, `ventilators_count`, `blood_source`, `blood_24h`, `oxygen_sources`, `oxygen_24h`, `ambulance_24h`.
  - Derived \*: `icu_beds`, `hdu_beds`, `isolation_beds`, `nicu_cots`, `total_beds`. These follow Wards & beds and are never typed.
  - `opd_hours` is a hub key: weekday → from/to.

## 5. Level presets: extraction tables (MoH _Service Standards and Service Delivery Standards for the Health Sector_, 2016)

Pages are cited as printed page (PDF page). Each item cites the clause that names it. **Nothing is added that the text doesn't say.** The laboratory menu per level is a _separate_ document (the national test menu, unavailable, §7), so no preset carries tests.

| Level (`hospitals.level`)                                               | Departments                                                                                                                                                                                                                                                                                  | Clinics                                                                                                                                                              | Imaging                                                                        | Other                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| HC III (`hc3`) — §2.5.3, pp. 21–26 (PDF 28–33)                          | —                                                                                                                                                                                                                                                                                            | antenatal_maternal, postnatal, family_planning, immunisation, nutrition (29.1–29.9); hiv_art, tb (30.1–30.2)                                                         | —                                                                              | —                                                                        |
| HC IV (`hc4`) — §2.5.4, pp. 27–32 (PDF 34–39)                           | GENERAL_SURGERY (52: caesarean, surgery), DENTAL_ORAL (53), PALLIATIVE_CARE (54), LABORATORY (55), MORTUARY (56)                                                                                                                                                                             | antenatal_maternal, postnatal, family_planning (43.1–43.6), immunisation (44), nutrition (45), hiv_art, tb (46), mental_health (50)                                  | ultrasound (55.2, obstetric)                                                   | theatres (52)                                                            |
| General Hospital (`district`) — §2.5.5, pp. 33–38 (PDF 40–45)           | GENERAL_SURGERY, OBSTETRICS_GYNAECOLOGY (70.1–70.2, 61.2), EMERGENCY (66.3–66.4), PSYCHIATRY (68, 71), DENTAL_ORAL (72), PALLIATIVE_CARE (73), LABORATORY, RADIOLOGY_IMAGING (74), MORTUARY (75), NUTRITION_DIETETICS (63)                                                                   | antenatal_maternal, postnatal, family_planning (61.1–61.5), immunisation (62), nutrition (63), hiv_art, tb (64.1.1–64.1.2), mental_health (68), palliative_care (73) | xray, fluoroscopy (74.2: plain radiographs, barium swallow), ultrasound (74.3) | theatres (70), mortuary (75)                                             |
| Regional Referral (`regional`) — §2.5.6, pp. 39–43 (PDF 46–50)          | INTERNAL_MEDICINE, PAEDIATRICS_CHILD_HEALTH (82.1), GENERAL_SURGERY, OBSTETRICS_GYNAECOLOGY, ORTHOPAEDICS, ENT, OPHTHALMOLOGY (83.1–83.4), PHYSIOTHERAPY_REHAB (84.3), DENTAL_ORAL (86), PALLIATIVE_CARE (87), LABORATORY, RADIOLOGY_IMAGING (88), MORTUARY (89), NUTRITION_DIETETICS (81.2) | antenatal_maternal, postnatal, family_planning (79.1–79.5), immunisation (80), nutrition (81), palliative_care (87)                                                  | xray (88.2), ultrasound (88.3)                                                 | lab section histopathology_cytology (88.4), theatres (83), mortuary (89) |
| National Referral (`national_referral`) — §2.5.7, pp. 44–48 (PDF 51–55) | as Regional, plus ONCOLOGY → clinic (102.2)                                                                                                                                                                                                                                                  | as Regional, plus oncology (102)                                                                                                                                     | xray, ultrasound, ct, mri (103.2–103.3, "basic and advanced")                  | histopathology_cytology (103.4)                                          |

- **Signed:** Fadhul (CSO), under the 26 Sep 2026 blanket sign-off. Applying a preset only **adds** items as _Planned_ (not live, not public) and never overwrites (PS-2).
- **Δ** The Regional Referral list in the 2016 text has no clause for HIV/TB clinics (§2.5.6 goes from nutrition to integrated clinical care). The preset follows the text. Admins tick them from the catalogue.

## 6. Legacy mapping (Appendix B, corrected: departments are junction tables, not arrays)

| Source                                                 | Lands as                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hospital_application_departments`                     | Departments already exist (provisioning copied them). Nothing to import.                                                                                                                                                                      |
| `… .is_primary`                                        | Start department (backfilled in 0080)                                                                                                                                                                                                         |
| `hospital_application_specialties`                     | IM units (the setup checklist already wrote them)                                                                                                                                                                                             |
| `specialised_clinics` (+ `_other`)                     | Clinics, _Planned_ (`service_lines` session mode, `active = false`, no days). `_other` becomes custom clinics, flagged for review.                                                                                                            |
| `diagnostic_services` `lab_*`                          | Laboratory department plus section units (`lab_chem`→clinical_chemistry, `lab_haem`→haematology, `lab_micro`→microbiology, `lab_histo`→histopathology_cytology)                                                                               |
| `diagnostic_services` `img_*` / ecg / echo / endoscopy | Imaging offerings, _in-house_, machines unknown                                                                                                                                                                                               |
| `support_services`                                     | pharmacy → PHARMACY department + `pharmacy_dispensing_points` unknown; blood_bank → `blood_source = onsite` (**pending**); operating_theatres → `theatres_count` unknown; mortuary → `mortuary = yes`; ambulance → `ambulances_count` unknown |
| `has_onsite_pharmacy`                                  | PHARMACY department                                                                                                                                                                                                                           |
| `services_offered`                                     | emergency_24_7 → `emergency_capability = 24h` (**pending**). opd → noted in hours (days unknown). inpatient / day_care / referral → noted only (no key yet)                                                                                   |
| bands, infrastructure                                  | Not imported (real counts come from wards, staff and usage; infrastructure is Hospital profile)                                                                                                                                               |

Every routing value arrives **pending**. The importer can't verify it; a second admin does (CAP-5).

## 7. Reference data: status

| Dataset                                               | Status                                                                                                   | In the product                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| MoH Service Standards 2016                            | extracted, signed                                                                                        | presets shown                                                                                                                             |
| National standard test menu 2017 (146 / 85 / 57 / 31) | **not obtainable** (CPHL link dead, 26 Sep 2026)                                                         | "See the gaps" is hidden. The Diagnostics tab says "The national test menu comparison arrives when MoH's list is imported." (Law 5, PS-1) |
| Public holidays                                       | 2026 full list plus 2027 fixed dates, source officeholidays.com (26 Sep 2026), fixed dates cross-checked | seeded. Eid 2027 is added when announced.                                                                                                 |
| LOINC (ordering catalogue)                            | 9 tests (0041)                                                                                           | the test menu offers these. More arrive with the EMR catalogue or the national menu.                                                      |

## 8. Audit verbs added to `sa_audit_log`

`update_department`, `set_department_live`, `set_start_department`, `assign_department_head`, `end_department_head`, `archive_structure`, `unarchive_structure`, `update_ward`, `update_beds`, `update_place`, `update_diagnostics`, `set_capability`, `verify_capability`, `reject_capability`, `report_availability`, `add_closure`, `lift_closure`, `apply_service_preset`, `import_legacy_services`.

The existing `assign_ward_in_charge`, `end_ward_in_charge`, `update_service_line`, `update_session_template` and `cancel_session` are reused. Every hub audit row uses target kind `hospital` (target id = the hospital), with the item carried in before/after.

## 9. Consumer contracts (prompt §5.10)

| Consumer                           | Contract                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff sign-up                      | `listDepartments` returns **live, not archived, top-level** departments of every kind. Reception gets Reception & front desk (H8).                                                                      |
| Intake / Desk                      | `listHospitalDepartments` returns live, not archived.                                                                                                                                                   |
| Patient queue                      | Live top-level departments.                                                                                                                                                                             |
| Booking (patient, USSD, discovery) | Lines whose department is live, active, and `audience = patients`. Desk sees every audience. USSD also filters confidential lines (existing gap closed).                                                |
| Ordering (EMR)                     | `getOrderingAvailability(hospitalId, code)` → `{ where, hours, statedTurnaround, referredTo, availability: { state, since, lastConfirmedAt } \| null }`. Pure over its inputs. **Informs only** (AV-4). |
| Lab-tech workspace                 | Sections = units of Laboratory. The worklist routing seam is the `section_id` on the offering.                                                                                                          |
| Emergency pathway                  | Keeps reading its own columns, which now change **only after verification**. The capability profile exposes each key's verification state for signposting ("unverified").                               |
| Profile / referral / partners      | `computeCapabilityProfile(hospitalId, audience)`: internal / network / public. No personal data. Versioned `v1`.                                                                                        |

**The EMR session (`medsync-ac`) is told:**

- test overlay = `diagnostic_offerings` keyed by code;
- availability = `availability_events` plus the projection;
- migration 0080 and ADRs 0150+ are the hub's.

## 10. Wireframe deltas to prompt §5

1. **Tabs.** Seven sub-routes: `/hospital-admin/departments` (Departments), `/wards`, `/clinics`, `/diagnostics`, `/emergency`, `/availability`, `/hours`.
   - A plum underline marks the current tab (navigation = place, ADR 0097). On a phone the tabs become a `<select>`.
2. **Header count.** "▲ N unavailable · View" in amber, with icon and words. It is also the nav badge, in amber.
3. **Departments.**
   - Rows are grouped by kind.
   - Each row: status chip ("Live" / "Not on MedSync yet" / "Planned" / "Archived") · "Start" marker · head · counts (units, wards, clinics, staff) · ›.
   - The panel has tabs: Units · Wards · Clinics · Staff · History. The Services tab is **Δ** folded into Clinics: a department's services _are_ its clinics.
4. **Wards.** The ward panel generates beds; occupancy is a single honest line.
5. **Clinics.**
   - Timetable (week grid) and List.
   - The panel edits the line (audience, confidential, place, unit) and its days. One-off = a single-day template.
   - Print is print CSS: one A4 landscape page per week.
6. **Diagnostics.**
   - **Laboratory:** sections plus the test menu table, with bulk edit.
   - **Imaging & other tests:** the catalogue with where, machines and hours.
7. **Emergency & support.**
   - Numbered sections [01]–[09]. Routing values show "Verified by … · date" or amber "Needs a second admin".
   - "Verify" and "Reject" appear for **another** admin only.
8. **Availability.** The list, "Report a problem" (panel), Unconfirmed → [Confirm], and 90-day history.
9. **Hours & places.**
   - [01] OPD hours, [02] public holidays (read-only list with source), [03] closures (preview → confirm → cancel flow), [04] places.

The phone layout is unbroken: tables become stacked rows, and panels become full-height sheets (the existing `Sheet`).

## 11. ADRs

0150 hub as single editor · 0151 reuse map · 0152 department kinds + live status · 0153 effective-dated heads and in-charges · 0154 clinics = booking services, days = templates, holidays and closures · 0155 confidential clinics in messages · 0156 test menu overlay + national menu (pending data) · 0157 availability events · 0158 four-eyes for routing capabilities · 0159 capability profile · 0160 level presets.

## 12. Decision table (prompt §13), with the repo deltas

| #           | Decision             | As signed                                                               | Δ                                                          |
| ----------- | -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| D-SVC-01    | Name and place       | "Departments & services", route kept, seven tabs                        | —                                                          |
| D-SVC-02    | Live per department  | switch; only live departments in sign-up, queues, booking               | Existing departments backfilled live (no behaviour change) |
| D-SVC-03    | Level presets        | from MoH 2016, signed, Planned-only                                     | Tests excluded (menu unavailable)                          |
| D-SVC-04    | Kinds + additions    | 4 kinds, 7 additions                                                    | —                                                          |
| D-SVC-05    | Heads / in-charges   | effective-dated, acting                                                 | In-charge reuses the 0031 table                            |
| D-SVC-06    | Beds                 | count required, register optional, no occupancy                         | —                                                          |
| D-SVC-07    | Clinics              | booking service + templates                                             | One-off = single-day template                              |
| D-SVC-08    | Confidential list    | HIV/ART, TB, mental health, FP, SRH                                     | —                                                          |
| D-SVC-09    | Holidays / closures  | seeded yearly; skip unless marked; closures win and run the cancel flow | —                                                          |
| D-SVC-10    | Test menu            | overlay on ordering catalogue (`loinc_codes`)                           | National menu import pending data                          |
| D-SVC-11    | Routing four-eyes    | R keys need another admin or a superadmin                               | Hub-local mechanism; profile form closed to routing edits  |
| D-SVC-12    | Availability         | admins + heads report; unconfirmed after date; never blocks             | In-charge reporting is a seam                              |
| D-SVC-13    | Profile              | 3 audiences, no personal data                                           | —                                                          |
| D-SVC-14    | Standards comparison | own admins; superadmin aggregates only                                  | Departments/clinics/imaging vs preset; tests later         |
| D-SVC-15    | Legacy import        | once, per Appendix B (corrected)                                        | —                                                          |
| D-SVC-16    | HOD editing          | actions accept current head, own department                             | Head scope implemented in the hub function; UI later       |
| D-SVC-17    | Onboarding link-up   | checklist links here; Departments done when a start department is live  | Checklist's department/ward forms become links             |
| E-SVC-01…06 | Engineering          | as recommended                                                          | One Edge Function with ops; plain columns (E-SVC-02)       |

**Signature:** Fadhul, CSO and owner. Blanket sign-off, 26 Sep 2026, recorded by Claude on the owner's instruction. A revocation of any single line reopens only that line.
