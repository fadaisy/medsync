/**
 * Blood-pressure reference-range interpretation for the clerkship vitals.
 *
 * The clerkship is chronic-disease-heavy (HTN, diabetes), so BP is interpreted
 * against HYPERTENSION reference categories — NOT the NEWS2 acute-deterioration
 * banding (which only flags LOW systolic). Two standards are provided and the
 * clinician selects which is the reference:
 *
 *  - WHO/ESC (ESC/ESH 2018, ESC 2024; aligns with the Uganda Clinical Guidelines /
 *    WHO HEARTS — the natural default for a Ugandan tool): hypertension ≥140/90.
 *  - ACC/AHA 2017: hypertension ≥130/80 (the lower US threshold).
 *
 * Category = the HIGHER of the systolic/diastolic bands (standard convention).
 * Sustained low systolic (<90) is surfaced as hypotension in both. CSO ratifies.
 */

export type BpStandard = "who_esc" | "acc_aha";

export const BP_STANDARDS: { value: BpStandard; label: string }[] = [
  { value: "who_esc", label: "WHO/ESC" },
  { value: "acc_aha", label: "ACC/AHA" },
];
export const BP_STANDARD_SOURCE: Record<BpStandard, string> = {
  who_esc: "ESC/ESH 2018 · WHO HEARTS (HTN ≥140/90)",
  acc_aha: "ACC/AHA 2017 (HTN ≥130/80)",
};

export type BpSeverity = "normal" | "elevated" | "mild" | "moderate" | "severe" | "low";

export interface BpCategory {
  label: string;
  severity: BpSeverity;
}

export function bpCategory(
  sbp: number | undefined,
  dbp: number | undefined,
  std: BpStandard,
): BpCategory | null {
  if (sbp == null && dbp == null) return null;
  // Hypotension first (both standards) — sustained low systolic is the concern.
  if (sbp != null && sbp < 90) return { label: "Hypotension", severity: "low" };
  const s = sbp ?? 0;
  const d = dbp ?? 0;

  if (std === "who_esc") {
    if (s >= 180 || d >= 110) return { label: "Grade 3 hypertension (severe)", severity: "severe" };
    if (s >= 160 || d >= 100) return { label: "Grade 2 hypertension", severity: "moderate" };
    if (s >= 140 || d >= 90) return { label: "Grade 1 hypertension", severity: "mild" };
    if (s >= 130 || d >= 85) return { label: "High–normal", severity: "elevated" };
    if (s >= 120 || d >= 80) return { label: "Normal", severity: "normal" };
    return { label: "Optimal", severity: "normal" };
  }

  // ACC/AHA 2017
  if (s >= 180 || d >= 120) return { label: "Hypertensive crisis", severity: "severe" };
  if (s >= 140 || d >= 90) return { label: "Stage 2 hypertension", severity: "moderate" };
  if (s >= 130 || d >= 80) return { label: "Stage 1 hypertension", severity: "mild" };
  if (s >= 120) return { label: "Elevated", severity: "elevated" };
  return { label: "Normal", severity: "normal" };
}

/** Input-border class per severity. Clinical-red reserved for genuine emergencies
 *  (severe/grade-3/crisis HTN + hypotension); amber for milder HTN; teal for normal. */
export const BP_BORDER_TONE: Record<BpSeverity, string> = {
  normal: "border-teal-400 dark:border-teal-700",
  elevated: "border-amber-300 dark:border-amber-700",
  mild: "border-amber-400 dark:border-amber-600",
  moderate: "border-amber-500 dark:border-amber-600",
  severe: "border-red-400 dark:border-red-700",
  low: "border-red-400 dark:border-red-700",
};

/** Text/label tone per severity. */
export const BP_TEXT_TONE: Record<BpSeverity, string> = {
  normal: "text-teal-700 dark:text-teal-400",
  elevated: "text-amber-700 dark:text-amber-400",
  mild: "text-amber-700 dark:text-amber-400",
  moderate: "text-amber-700 dark:text-amber-400",
  severe: "text-red-700 dark:text-red-400",
  low: "text-red-700 dark:text-red-400",
};
