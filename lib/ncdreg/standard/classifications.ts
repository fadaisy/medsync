/**
 * Rule-based outcome classifications for the full modules (§5.6, §6). A module record refers to one
 * of these by id; the indicator engine calls `classify(id, input)` and never looks at the module code.
 *
 * Thresholds are monitoring definitions locked to HEARTS360, not treatment targets.
 */
const V = { status: "draft", effective_from: "2026-10-05" } as const;

export type ClassifyInput = {
  /** Visit blood pressure at the latest visit in the window. */
  bp: readonly [number, number] | null;
  /** Glucose at the latest visit in the window, mmol/L. */
  glucose: { value: number; type: "fasting" | "random" | "post_meal" } | null;
  /** The latest HbA1c result dated inside the window, if any. */
  hba1cInWindow: number | null;
};

export type Classification = {
  id: string;
  version: string;
  status: "draft" | "approved";
  effective_from: string;
  text: string;
  /** Returns a class, or `not_recorded` when the visit carries nothing the rule can use. */
  classify: (i: ClassifyInput) => string;
};

export const BP_CONTROL: Classification = {
  ...V,
  id: "bp_control",
  version: "bp-control-hearts360-1",
  text: "Visit blood pressure below 140 and below 90 is in range; otherwise not in range.",
  classify: ({ bp }) =>
    bp == null ? "not_recorded" : bp[0] < 140 && bp[1] < 90 ? "in_range" : "not_in_range",
};

const byHba1c = (h: number) =>
  h < 7.0 ? "in_range" : h < 9.0 ? "moderately_raised" : "very_raised";
const byFasting = (g: number) =>
  g < 7.0 ? "in_range" : g < 11.1 ? "moderately_raised" : "very_raised";

export const GLYCAEMIC: Classification = {
  ...V,
  id: "glycaemic",
  version: "glycaemic-hearts360-1",
  text:
    "HbA1c dated within the window if one exists (below 7.0% in range; 7.0 to 8.9% moderately raised; 9.0% or above very raised); " +
    "otherwise fasting glucose (below 7.0; 7.0 to 11.0; 11.1 mmol/L or above). Random or after-meal glucose only: not classifiable.",
  classify: ({ glucose, hba1cInWindow }) => {
    if (hba1cInWindow != null) return byHba1c(hba1cInWindow);
    if (glucose == null) return "not_recorded";
    return glucose.type === "fasting" ? byFasting(glucose.value) : "not_classifiable";
  },
};

export const CLASSIFICATIONS: Readonly<Record<string, Classification>> = {
  bp_control: BP_CONTROL,
  glycaemic: GLYCAEMIC,
};

/** Neutral display words for each class (§11.4 wording). */
export const CLASS_LABELS: Readonly<Record<string, string>> = {
  in_range: "In range",
  not_in_range: "Not in range",
  moderately_raised: "Moderately raised",
  very_raised: "Very raised",
  not_classifiable: "Not classifiable",
  controlled: "Recorded as controlled",
  partly_controlled: "Recorded as partly controlled",
  not_controlled: "Recorded as not controlled",
  not_assessed: "Not assessed",
  not_recorded: "Not recorded",
  no_visit: "No visit in 3 months",
};

/** Class labels a module-specific screen should use where the rule allows a plainer phrase. */
export const RULE_CLASS_PHRASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  bp_control: { in_range: "Below 140/90", not_in_range: "140/90 or above" },
  glycaemic: {
    in_range: "In range",
    moderately_raised: "Moderately raised",
    very_raised: "Very raised",
    not_classifiable: "Random glucose only",
  },
};
