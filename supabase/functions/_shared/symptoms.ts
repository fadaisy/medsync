/**
 * What the patient says is bothering them, at booking (ADR 0095) — the
 * vocabulary three runtimes share. ZERO IMPORTS on purpose: Next imports
 * this as `@/supabase/functions/_shared/symptoms`, Deno as `./symptoms.ts`,
 * the phone as `@shared/symptoms`.
 *
 * The boundary this module keeps (PRD §5.4 as amended by ADR 0095): a
 * symptom list is DESCRIPTIVE. It is stored on the appointment as the
 * patient wrote it and shown to the clinic. Nothing orders, ranks, routes,
 * scores or colours a booking by it, and nothing under lib/triage,
 * lib/clerkship or lib/encounter may read it (the clinical firewall test
 * enforces both). The catalogue's decision-support flags (must_not_miss,
 * is_pain, uganda_flag) are never selected onto a booking surface.
 */

/** How long it has been going on — the five chips, in the order they are shown. */
export const SYMPTOM_DURATIONS = [
  { code: "today", label: "Started today" },
  { code: "days", label: "A few days" },
  { code: "week", label: "About a week" },
  { code: "weeks", label: "A few weeks" },
  { code: "month_plus", label: "A month or more" },
] as const;

export type SymptomDuration = (typeof SYMPTOM_DURATIONS)[number]["code"];

export const SYMPTOM_DURATION_CODES = SYMPTOM_DURATIONS.map((d) => d.code) as [
  SymptomDuration,
  ...SymptomDuration[],
];

/** A ceiling, not a target: eight is more than any booking form asks for. */
export const MAX_SYMPTOMS = 8;
/** A typed-in symptom is a phrase, not a note — the note field exists for prose. */
export const MAX_SYMPTOM_LABEL = 80;

/**
 * One entry of `appointments.symptoms`. `code` is a `symptom_catalog.code`
 * when the patient tapped a catalogue entry, null when they typed their
 * own; `label` is always the words shown to the clinic.
 */
export interface BookingSymptom {
  code: string | null;
  label: string;
  duration: SymptomDuration;
}

/**
 * The sentence every symptom selector shows, verbatim (web, desk, phone).
 * It states the boundary to the patient in their own terms; the firewall
 * test asserts it is present wherever the selector is.
 */
export const SYMPTOMS_NOTE =
  "This is passed to the clinic as you wrote it. It does not change your place in line or your time.";

/**
 * The shortlist under "How are you feeling today?" on the patient home
 * (ADR 0096): the catalogue's first eight in ITS OWN order (`sort_order`
 * 10…80 of the IM-first seed, migration 0042) — a rule, not a curation.
 * Rendered flat, in this order; "More…" reaches the whole catalogue. To show
 * a different eight, change this list — not the catalogue.
 */
export const QUICK_PICK_CODES = [
  "chest_pain",
  "dyspnoea",
  "cough",
  "palpitations",
  "oedema",
  "abdominal_pain",
  "headache",
  "fever",
] as const;

/** The catalogue's body systems, in the order a patient scans them, with lay names. */
export const SYMPTOM_SYSTEMS = [
  { code: "general", label: "General" },
  { code: "respiratory", label: "Breathing" },
  { code: "cardiovascular", label: "Heart and circulation" },
  { code: "gastrointestinal", label: "Stomach and bowels" },
  { code: "neurological", label: "Head, nerves and brain" },
  { code: "genitourinary", label: "Urine and reproductive" },
  { code: "musculoskeletal", label: "Bones, joints and muscles" },
  { code: "skin", label: "Skin" },
  { code: "ent_eyes", label: "Ears, nose, throat and eyes" },
  { code: "endocrine", label: "Hormones" },
  { code: "haematological", label: "Blood" },
  { code: "psychiatric", label: "Mood and mind" },
] as const;

export function symptomSystemLabel(code: string): string {
  return SYMPTOM_SYSTEMS.find((s) => s.code === code)?.label ?? "Other";
}

export function symptomDurationLabel(code: string): string {
  return SYMPTOM_DURATIONS.find((d) => d.code === code)?.label ?? code;
}

/**
 * The one line a staff card prints: "Headache (a few days) · Fever (started
 * today)". Lower-cased duration so it reads as a clause, not a heading.
 */
export function formatSymptoms(symptoms: ReadonlyArray<BookingSymptom> | null | undefined): string {
  if (!symptoms || symptoms.length === 0) return "";
  return symptoms
    .map((s) => `${s.label} (${symptomDurationLabel(s.duration).toLowerCase()})`)
    .join(" · ");
}

/**
 * The complaint as one line for a staff card: the symptoms, then the
 * patient's note in quotes — either alone when the other is absent, null
 * when both are. "Headache (a few days) · Fever (started today) — “worse at night”".
 */
export function complaintLine(
  symptoms: ReadonlyArray<BookingSymptom> | null | undefined,
  note: string | null | undefined,
): string | null {
  const parts = [formatSymptoms(symptoms), note?.trim() ? `\u201c${note.trim()}\u201d` : ""].filter(
    Boolean,
  );
  return parts.length ? parts.join(" \u2014 ") : null;
}

/**
 * Hand validation for runtimes without zod (the phone) and for reading a
 * jsonb column back defensively: returns the well-formed entries, or null
 * when the value is not a list. Trims and caps labels; drops anything else.
 */
export function normaliseSymptoms(raw: unknown): BookingSymptom[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BookingSymptom[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SYMPTOMS) break;
    if (!item || typeof item !== "object") continue;
    const { code, label, duration } = item as Record<string, unknown>;
    if (typeof label !== "string" || typeof duration !== "string") continue;
    if (!SYMPTOM_DURATION_CODES.includes(duration as SymptomDuration)) continue;
    const text = label.trim().slice(0, MAX_SYMPTOM_LABEL);
    if (!text) continue;
    out.push({
      code: typeof code === "string" && code ? code : null,
      label: text,
      duration: duration as SymptomDuration,
    });
  }
  return out;
}
