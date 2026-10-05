/**
 * Chart colour roles (§11.4). Outcome distributions: one ordinal ramp of the action hue (teal), the
 * darkest step always the leading class, lighter steps in class order; neutral ink for no visit,
 * not recorded and classes that could not be assessed. Unordered sets take one place hue each:
 * care bands sky, kidney categories grape. Never red, amber or green. Text never wears these.
 */
export const OUTCOME_RAMP = ["bg-teal-700", "bg-teal-400", "bg-teal-200", "bg-teal-100"] as const;

const NEUTRAL: Readonly<Record<string, string>> = {
  not_assessed: "bg-ink-400",
  not_classifiable: "bg-ink-400",
  not_recorded: "bg-ink-200",
  no_visit: "bg-ink-300",
};

export const isNeutralClass = (cls: string) => cls in NEUTRAL;

/** `ordered` lists the classes leading first, then the rest in class order. */
export function outcomeTone(cls: string, ordered: readonly string[]): string {
  const grey = NEUTRAL[cls];
  if (grey) return grey;
  const i = ordered.filter((c) => !isNeutralClass(c)).indexOf(cls);
  return OUTCOME_RAMP[Math.min(Math.max(i, 0), OUTCOME_RAMP.length - 1)]!;
}

export const CARE_BAND_TONES = ["bg-sky-200", "bg-sky-400", "bg-sky-600", "bg-sky-800"] as const;
export const KIDNEY_TONES = [
  "bg-grape-200",
  "bg-grape-300",
  "bg-grape-400",
  "bg-grape-500",
  "bg-grape-700",
  "bg-grape-900",
] as const;
