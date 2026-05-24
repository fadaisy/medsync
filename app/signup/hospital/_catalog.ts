/**
 * Catalog constants for the hospital application form (§C–§D).
 *
 * Until the reference-data layer carries a separate `department_family`
 * catalog, the form-side picks live here. The values match the codes
 * stored in `hospital_application_departments.department_family` and
 * mirror the seed in `roles.department_family` where it overlaps.
 *
 * When the seed grows (Phase 1.x adds Surgery/OB/Gyn etc.), this list
 * is the source of truth for what the form offers; junctions stay
 * append-only so older applications keep their selections meaningful.
 */

export interface DepartmentChoice {
  /** Stable code stored in `hospital_application_departments.department_family`. */
  code: string;
  label: string;
}

export interface DepartmentGroup {
  groupLabel: string;
  /** True when picking one of these reveals a nested IM sub-specialty section. */
  nested?: "im_subspecialties";
  items: ReadonlyArray<DepartmentChoice>;
}

export const DEPARTMENT_GROUPS: ReadonlyArray<DepartmentGroup> = [
  {
    groupLabel: "Medicine",
    items: [
      { code: "INTERNAL_MEDICINE", label: "Internal Medicine" },
      { code: "FAMILY_MEDICINE", label: "Family Medicine" },
    ],
    nested: "im_subspecialties",
  },
  {
    groupLabel: "Surgery",
    items: [
      { code: "GENERAL_SURGERY", label: "General Surgery" },
      { code: "ORTHOPAEDICS", label: "Orthopaedics" },
      { code: "UROLOGY", label: "Urology" },
      { code: "NEUROSURGERY", label: "Neurosurgery" },
      { code: "CARDIOTHORACIC", label: "Cardiothoracic" },
      { code: "PAEDIATRIC_SURGERY", label: "Paediatric Surgery" },
      { code: "PLASTIC_RECONSTRUCTIVE", label: "Plastic / Reconstructive" },
      { code: "ENT", label: "ENT" },
      { code: "MAXILLOFACIAL", label: "Maxillofacial" },
    ],
  },
  {
    groupLabel: "Women & children",
    items: [
      { code: "OBSTETRICS_GYNAECOLOGY", label: "Obstetrics & Gynaecology" },
      { code: "PAEDIATRICS_CHILD_HEALTH", label: "Paediatrics & Child Health" },
      { code: "NEONATOLOGY", label: "Neonatology" },
    ],
  },
  {
    groupLabel: "Acute & critical",
    items: [
      { code: "EMERGENCY", label: "Emergency / Casualty" },
      { code: "ANAESTHESIA", label: "Anaesthesia" },
      { code: "INTENSIVE_CARE", label: "Intensive Care (ICU/HDU)" },
    ],
  },
  {
    groupLabel: "Mental & rehab",
    items: [
      { code: "PSYCHIATRY", label: "Psychiatry / Mental Health" },
      { code: "PHYSIOTHERAPY_REHAB", label: "Physiotherapy & Rehabilitation" },
      { code: "PALLIATIVE_CARE", label: "Palliative Care" },
    ],
  },
  {
    groupLabel: "Other",
    items: [
      { code: "DENTAL_ORAL", label: "Dental / Oral Health" },
      { code: "PUBLIC_HEALTH", label: "Public / Community Health" },
      { code: "OPHTHALMOLOGY", label: "Ophthalmology" },
    ],
  },
];

/** Every code that should resolve to a valid department choice. */
export const ALL_DEPARTMENT_CODES: ReadonlyArray<string> = DEPARTMENT_GROUPS.flatMap((g) =>
  g.items.map((i) => i.code),
);

/* ─── Section D catalogues (mirror CHECK lists in migration 0021) ────── */

export const SPECIALISED_CLINIC_CHOICES = [
  { code: "diabetes", label: "Diabetes" },
  { code: "hypertension_cardiac", label: "Hypertension / cardiac" },
  { code: "renal_dialysis", label: "Renal / dialysis" },
  { code: "oncology", label: "Oncology" },
  { code: "hiv_art", label: "HIV / ART" },
  { code: "tb", label: "TB" },
  { code: "antenatal_maternal", label: "Antenatal / maternal" },
  { code: "asthma_copd", label: "Asthma / COPD" },
  { code: "mental_health", label: "Mental health" },
] as const;

export const DIAGNOSTIC_CHOICES = [
  { code: "lab_chem", label: "Lab — Clinical chemistry", group: "Lab" },
  { code: "lab_haem", label: "Lab — Haematology", group: "Lab" },
  { code: "lab_micro", label: "Lab — Microbiology", group: "Lab" },
  { code: "lab_histo", label: "Lab — Histopathology / Cytology", group: "Lab" },
  { code: "img_xray", label: "Imaging — X-ray", group: "Imaging" },
  { code: "img_ultrasound", label: "Imaging — Ultrasound", group: "Imaging" },
  { code: "img_ct", label: "Imaging — CT", group: "Imaging" },
  { code: "img_mri", label: "Imaging — MRI", group: "Imaging" },
  { code: "img_mammography", label: "Imaging — Mammography", group: "Imaging" },
  { code: "ecg", label: "ECG", group: "Other" },
  { code: "echo", label: "Echocardiography", group: "Other" },
  { code: "endoscopy", label: "Endoscopy", group: "Other" },
] as const;

export const SUPPORT_SERVICE_CHOICES = [
  { code: "pharmacy", label: "Pharmacy" },
  { code: "blood_bank", label: "Blood bank" },
  { code: "operating_theatres", label: "Operating theatres" },
  { code: "mortuary", label: "Mortuary" },
  { code: "ambulance", label: "Ambulance" },
] as const;

export const SERVICE_OFFERED_CHOICES = [
  { code: "opd", label: "OPD" },
  { code: "inpatient", label: "Inpatient" },
  { code: "day_care", label: "Day-care" },
  { code: "emergency_24_7", label: "Emergency 24/7" },
  { code: "referral", label: "Referral" },
] as const;

export const BED_CAPACITY_BANDS = [
  { code: "<25", label: "Under 25" },
  { code: "25-99", label: "25–99" },
  { code: "100-299", label: "100–299" },
  { code: "300-799", label: "300–799" },
  { code: "800+", label: "800+" },
] as const;

export const STAFF_BANDS = [
  { code: "<10", label: "Under 10" },
  { code: "10-49", label: "10–49" },
  { code: "50-199", label: "50–199" },
  { code: "200-499", label: "200–499" },
  { code: "500+", label: "500+" },
] as const;

export const OPD_BANDS = BED_CAPACITY_BANDS;

export const CONNECTIVITY_CHOICES = [
  { code: "reliable", label: "Reliable" },
  { code: "intermittent", label: "Intermittent" },
  { code: "limited", label: "Limited" },
] as const;

export const POWER_CHOICES = [
  { code: "yes", label: "Reliable" },
  { code: "generator", label: "With generator backup" },
  { code: "unreliable", label: "Unreliable" },
] as const;

export const EMR_CHOICES = [
  { code: "none", label: "None" },
  { code: "paper", label: "Paper" },
  { code: "existing", label: "Existing EMR" },
] as const;

export const LICENSING_BODY_CHOICES = [
  { code: "moh", label: "Ministry of Health" },
  { code: "umdpc", label: "UMDPC" },
  { code: "other", label: "Other" },
] as const;

export const APPLICANT_ROLE_CHOICES = [
  { code: "med_super", label: "Medical Superintendent" },
  { code: "hospital_director", label: "Hospital Director" },
  { code: "administrator", label: "Administrator" },
  { code: "hod", label: "Head of Department" },
  { code: "it", label: "IT" },
  { code: "other", label: "Other" },
] as const;

export const AUTHORITY_TITLE_CHOICES = APPLICANT_ROLE_CHOICES;

export const SIGNATORY_TITLE_CHOICES = APPLICANT_ROLE_CHOICES;

export const CALLBACK_KIND_CHOICES = [
  { code: "phone", label: "Phone" },
  { code: "email", label: "Email" },
] as const;
