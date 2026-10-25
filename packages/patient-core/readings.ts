import rules from "../clinical-rules/patient-thresholds.v0.json";

/**
 * The patient-side reading check (Tide v1 §8.5, law L7).
 *
 * Pure: a reading in, a level and plain words out. The numbers live in
 * `packages/clinical-rules/patient-thresholds.v0.json`, marked pending CSO;
 * nothing here hard-codes a threshold. Every screen that shows a result also
 * shows `THRESHOLDS_NOTE`.
 *
 * This is decision support for the patient, never a diagnosis: a danger
 * level routes them to the danger interrupt and Help, and tells the care
 * team. It does not tell anyone what dose to take (law L5).
 */

export type ReadingKind = "bp" | "sugar" | "weight" | "pulse";
export type SugarContext = "fasting" | "lunch" | "supper" | "after" | "bedtime" | "random";

export type ReadingInput =
  | { kind: "bp"; top: number | null; bottom: number | null }
  | { kind: "sugar"; value: number | null; context: SugarContext }
  | { kind: "weight"; value: number | null }
  | { kind: "pulse"; value: number | null };

/** `empty` grey, `ok` green, `watch` amber (above target, low, or check the number), `danger` red. */
export type ReadingLevel = "empty" | "ok" | "watch" | "danger";

export interface ReadingCheck {
  level: ReadingLevel;
  /** The live line under the number. */
  text: string;
  /** Danger only: the headline on the danger card. */
  dangerWord?: string;
  /** Danger only: signs to ask about, in plain words. */
  signs?: string[];
  /** Low sugar only: the single safe self-care line. */
  selfCare?: string;
}

export const THRESHOLDS_STATUS = rules.status;
export const THRESHOLDS_NOTE = "Limits pending CSO sign-off.";

export const SUGAR_CONTEXT_WORDS: Record<SugarContext, string> = {
  fasting: "before breakfast",
  lunch: "before lunch",
  supper: "before supper",
  after: "after a meal",
  bedtime: "bedtime",
  random: "another time",
};

export const UNITS: Record<ReadingKind, string> = {
  bp: rules.bp.unit,
  sugar: rules.sugar.unit,
  weight: "kg",
  pulse: rules.pulse.unit,
};

const filled = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

/** Parse what the patient typed; empty or not a number is `null`. */
export function parseReading(text: string): number | null {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

export function checkReading(input: ReadingInput): ReadingCheck {
  switch (input.kind) {
    case "bp": {
      const { top, bottom } = input;
      if (!filled(top) || !filled(bottom)) return { level: "empty", text: "Type your number" };
      const r = rules.bp;
      if (top >= r.dangerTopAtLeast || bottom >= r.dangerBottomAtLeast)
        return {
          level: "danger",
          text: "Very high",
          dangerWord: "Your blood pressure is very high.",
          signs: ["Bad headache", "Chest pain", "Weak face, arm or speech"],
        };
      if (top < r.implausibleTopBelow || bottom < r.implausibleBottomBelow)
        return { level: "watch", text: "That looks too low. Check the number." };
      if (top < r.lowTopBelow || bottom < r.lowBottomBelow)
        return { level: "watch", text: "Low. Recheck, and tell your team if you feel dizzy." };
      if (top >= r.aboveTopAtLeast || bottom >= r.aboveBottomAtLeast)
        return {
          level: "watch",
          text: `Above your target of ${r.aboveTopAtLeast}/${r.aboveBottomAtLeast}`,
        };
      return { level: "ok", text: "In your range" };
    }
    case "sugar": {
      const { value, context } = input;
      if (!filled(value)) return { level: "empty", text: "Type your number" };
      const r = rules.sugar;
      if (value < r.dangerLowBelow)
        return {
          level: "danger",
          text: "Too low",
          dangerWord: "Your sugar is too low. Eat or drink something sweet now.",
          signs: ["Shaking or sweating", "Confused", "Very sleepy"],
          selfCare: "Eat or drink something sweet now.",
        };
      if (value >= r.dangerHighAtLeast)
        return {
          level: "danger",
          text: "Very high",
          dangerWord: "Your sugar is very high.",
          signs: ["Very thirsty", "Vomiting", "Fast breathing"],
        };
      const max = r.targetMaxByContext[context];
      const words = SUGAR_CONTEXT_WORDS[context];
      if (value > max) return { level: "watch", text: `Above your target for ${words} (${max})` };
      return { level: "ok", text: `In your target for ${words}` };
    }
    case "pulse": {
      const { value } = input;
      if (!filled(value)) return { level: "empty", text: "Type your number" };
      const r = rules.pulse;
      if (value < r.dangerBelow || value > r.dangerAbove)
        return {
          level: "danger",
          text: "Out of the safe range",
          dangerWord: "Your pulse is outside the safe range.",
          signs: ["Chest pain", "Fainting", "Short of breath"],
        };
      if (value < r.unusualBelow || value > r.unusualAbove)
        return { level: "watch", text: "Outside the usual range" };
      return { level: "ok", text: "Steady" };
    }
    case "weight": {
      // Weight has no threshold in v0: it is a trend, saved without a judgement.
      if (!filled(input.value)) return { level: "empty", text: "Type your number" };
      return { level: "ok", text: "Saved to your trend" };
    }
  }
}

/** The display value: "138/86", "7.1 mmol/L". */
export function readingValueText(input: ReadingInput): string {
  if (input.kind === "bp") return `${input.top ?? "–"}/${input.bottom ?? "–"}`;
  return `${input.value ?? "–"} ${UNITS[input.kind]}`;
}
