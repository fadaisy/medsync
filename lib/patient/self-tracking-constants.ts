/**
 * Client-safe constants for patient self-tracking. Kept separate from
 * `self-tracking.ts` (which is `server-only` because it pulls in
 * Drizzle / postgres) so client components like the log-reading form
 * can import labels + units + types without dragging the DB driver
 * into the browser bundle.
 */

export const READING_KIND_LABEL: Record<string, string> = {
  glucose: "Glucose",
  bp: "Blood pressure",
  weight: "Weight",
  spo2: "SpO₂",
  temperature: "Temperature",
  symptom: "Symptom",
  note: "Note",
  other: "Reading",
};

/** Numeric reading kinds (excludes symptom/note/other). */
export const NUMERIC_READING_KINDS = ["glucose", "bp", "weight", "spo2", "temperature"] as const;
export type NumericReadingKind = (typeof NUMERIC_READING_KINDS)[number];

/**
 * Every reading kind a patient can log. Derived from the numeric tuple rather
 * than retyped, and canonical: the log form's picker, `log/page.tsx`'s `?kind=`
 * allow-list and `logReadingAction`'s zod enum all read it from here. It was
 * declared three times, so a ninth kind reached one of them and not the others.
 */
export const READING_KINDS = [...NUMERIC_READING_KINDS, "symptom", "note", "other"] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

export const READING_UNIT_OPTIONS: Record<NumericReadingKind, ReadonlyArray<string>> = {
  glucose: ["mg/dL", "mmol/L"],
  bp: ["mmHg"],
  weight: ["kg", "lb"],
  spo2: ["%"],
  temperature: ["°C", "°F"],
};

export const READING_KIND_HINT: Record<string, string> = {
  glucose: "Fasting, post-meal, or random — your call.",
  bp: "Systolic over diastolic. Sit still for a minute first.",
  weight: "Same time of day works best for trends.",
  spo2: "Pulse oximeter reading on a finger.",
  temperature: "Oral, ear, or forehead — note it if you'd like.",
  symptom: "Describe what you're feeling. Severity is optional.",
  note: "Anything you want to remember.",
  other: "Something else worth tracking.",
};

export const SCHEDULE_PATTERN_LABEL: Record<string, string> = {
  as_needed: "As needed",
  once_daily: "Once daily",
  twice_daily: "Twice daily",
  thrice_daily: "Three times daily",
  custom: "Custom schedule",
};

export function expectedDosesPerDay(pattern: string): number {
  if (pattern === "once_daily") return 1;
  if (pattern === "twice_daily") return 2;
  if (pattern === "thrice_daily") return 3;
  return 0; // as_needed + custom — don't auto-score adherence
}

/**
 * Pretty-print a reading for compact display ("128/82 mmHg" or
 * "6.4 mmol/L"). Returns null for kinds that don't have a numeric
 * value (notes, symptoms without numbers).
 */
export function formatReadingValue(r: {
  kind: string;
  numericValue1: string | null;
  numericValue2: string | null;
  unit: string | null;
}): string | null {
  if (r.kind === "bp") {
    if (!r.numericValue1 || !r.numericValue2) return null;
    return `${trimZeros(r.numericValue1)}/${trimZeros(r.numericValue2)} ${r.unit ?? "mmHg"}`;
  }
  if (!r.numericValue1) return null;
  return `${trimZeros(r.numericValue1)}${r.unit ? ` ${r.unit}` : ""}`;
}

/**
 * When a reading was taken, as the patient's lists show it: 24-hour time on
 * the day it happened, `DD MMM` before that, and the year once it stops being
 * this one. `en-GB` so the field order can't drift with the server's locale.
 *
 * Home and the tracking hub render the same recent-readings list, so they
 * render it the same way — they used to disagree ("3h ago" against "14:30").
 */
export function formatReadingWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(d);
}

function trimZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}
