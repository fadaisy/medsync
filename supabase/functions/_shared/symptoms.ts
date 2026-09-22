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
 * A catalog item carries at most two qualifiers (`MAX_QUALIFIERS_PER_ITEM`
 * in symptom-catalog/types.ts — restated here because this module imports
 * nothing). Key and option are catalog keys; the label is the option's words.
 */
export const MAX_SYMPTOM_QUALIFIERS = 2;
export const MAX_QUALIFIER_KEY = 64;
export const MAX_QUALIFIER_LABEL = 80;

/** One answered qualifier on a catalog item, e.g. spreading → "to the arm". */
export interface SymptomQualifier {
  key: string;
  option: string;
  label: string;
}

/**
 * One entry of `appointments.symptoms` (v2, ADR 0098 ruling 3). `code` is a
 * `symptom_catalog.code` (descriptive picker) or a patient-catalog item key
 * when the patient tapped an entry, null when they typed their own; `label`
 * is always the words shown to the clinic. `duration` is optional since v2:
 * a catalog item carries its own qualifiers instead of the generic chips,
 * and an old row always has one. The tier is never on an element — it lives
 * on the submission and the appointment, so no card can colour a list by it.
 */
export interface BookingSymptom {
  code: string | null;
  label: string;
  duration?: SymptomDuration | null;
  qualifiers?: SymptomQualifier[];
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
 * today)". Lower-cased duration so it reads as a clause, not a heading; the
 * parenthesis only when a duration was given, then each qualifier's words as
 * ", to the arm" — so a v1 row prints exactly as it always did.
 */
export function formatSymptoms(symptoms: ReadonlyArray<BookingSymptom> | null | undefined): string {
  if (!symptoms || symptoms.length === 0) return "";
  return symptoms
    .map((s) => {
      const when = s.duration ? ` (${symptomDurationLabel(s.duration).toLowerCase()})` : "";
      const how = (s.qualifiers ?? []).map((q) => `, ${q.label}`).join("");
      return `${s.label}${when}${how}`;
    })
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
 * An entry with NO duration is kept (v2: catalog items carry qualifiers
 * instead); one with a duration that is not a chip is malformed and dropped,
 * as before. Malformed qualifiers are dropped one by one, never the entry.
 */
export function normaliseSymptoms(raw: unknown): BookingSymptom[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BookingSymptom[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SYMPTOMS) break;
    if (!item || typeof item !== "object") continue;
    const { code, label, duration, qualifiers } = item as Record<string, unknown>;
    if (typeof label !== "string") continue;
    const hasDuration = duration !== undefined && duration !== null;
    if (hasDuration && !SYMPTOM_DURATION_CODES.includes(duration as SymptomDuration)) continue;
    const text = label.trim().slice(0, MAX_SYMPTOM_LABEL);
    if (!text) continue;
    const entry: BookingSymptom = {
      code: typeof code === "string" && code ? code : null,
      label: text,
    };
    if (hasDuration) entry.duration = duration as SymptomDuration;
    const qs = normaliseQualifiers(qualifiers);
    if (qs.length) entry.qualifiers = qs;
    out.push(entry);
  }
  return out;
}

function normaliseQualifiers(raw: unknown): SymptomQualifier[] {
  if (!Array.isArray(raw)) return [];
  const out: SymptomQualifier[] = [];
  for (const q of raw) {
    if (out.length >= MAX_SYMPTOM_QUALIFIERS) break;
    if (!q || typeof q !== "object") continue;
    const { key, option, label } = q as Record<string, unknown>;
    if (typeof key !== "string" || typeof option !== "string" || typeof label !== "string")
      continue;
    const k = key.trim().slice(0, MAX_QUALIFIER_KEY);
    const o = option.trim().slice(0, MAX_QUALIFIER_KEY);
    const l = label.trim().slice(0, MAX_QUALIFIER_LABEL);
    if (!k || !o || !l) continue;
    out.push({ key: k, option: o, label: l });
  }
  return out;
}
