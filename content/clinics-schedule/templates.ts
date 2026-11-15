/**
 * D-CS-11: a usual week per facility level, keyed by the Services Hub's clinic catalogue codes and its level
 * presets (supabase/functions/_shared/services-hub.ts, the one source of which clinics a level runs). Signed 15 Nov
 * 2026 — the days and hours are a starting pattern, not MoH rules. Applying fills only clinics with
 * no sessions, as drafts.
 */
import type { SignedCopy } from "@/content/signed-copy";
import type { TemplateRow } from "@/lib/clinics-schedule/model";

// Signed by Fadhul (CSO) in chat, 15 Nov 2026.
export const TEMPLATES_STATUS: SignedCopy = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-11-15",
};

const h = (n: number) => n * 60;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

const HC4: TemplateRow[] = [
  { code: "general_medical_opd", days: [...WEEKDAYS], start: h(8), end: h(16) },
  { code: "antenatal_maternal", days: [2, 4], start: h(8), end: h(13) },
  { code: "diabetes", days: [3], start: h(8), end: h(13) },
  { code: "hypertension_cardiac", days: [3], start: h(8), end: h(13) },
  { code: "nutrition", days: [1], start: h(9), end: h(12) },
  { code: "mental_health", days: [5], start: h(9), end: h(13) },
  { code: "hiv_art", days: [1, 4], start: h(8), end: h(13) },
  { code: "tb", days: [2], start: h(8), end: h(12) },
  { code: "family_planning", days: [1, 3], start: h(8), end: h(12) },
  { code: "immunisation", days: [2, 4], start: h(8), end: h(12) },
];

const GENERAL: TemplateRow[] = [
  ...HC4,
  { code: "surgical_opd", days: [1, 4], start: h(8), end: h(13) },
  { code: "eye", days: [2, 4], start: h(8), end: h(13) },
  { code: "dental", days: [...WEEKDAYS], start: h(8), end: h(14) },
  { code: "orthopaedic", days: [3], start: h(8), end: h(13) },
  { code: "sickle_cell", days: [5], start: h(8), end: h(13) },
  { code: "paediatric_opd", days: [...WEEKDAYS], start: h(8), end: h(14) },
];

const REGIONAL: TemplateRow[] = [
  ...GENERAL,
  { code: "ent", days: [3], start: h(8), end: h(13) },
  { code: "skin", days: [2], start: h(8), end: h(12) },
  { code: "epilepsy_neurology", days: [4], start: h(9), end: h(13) },
  { code: "renal_dialysis", days: [2], start: h(9), end: h(13) },
  { code: "asthma_copd", days: [1], start: h(9), end: h(13) },
  { code: "oncology", days: [4], start: h(9), end: h(13) },
];

export const LEVEL_TEMPLATES = [
  {
    level: "hc4",
    title: "Health Centre IV",
    sub: "OPD, antenatal, NCD and nutrition clinics, mental health day",
    rows: HC4,
  },
  {
    level: "district",
    title: "General hospital",
    sub: "Adds surgery, eye, dental, sickle cell, orthopaedics and children's OPD",
    rows: GENERAL,
  },
  {
    level: "regional",
    title: "Regional referral hospital",
    sub: "Every specialist clinic, including referral-only ones",
    rows: REGIONAL,
  },
] as const;
