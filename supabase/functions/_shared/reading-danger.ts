/**
 * The server's copy of the patient's danger rule (patient app v2 §8.1 "Danger rules", S2; law MR10).
 *
 * The phone and the web decide "danger" with `packages/patient-core/readings.ts` `checkReading`. When a reading
 * reaches the server, this decides whether to tell the care team (S19). The thresholds are the same file: the
 * server keeps a byte-identical copy, `patient-thresholds.v0.json`, because an Edge Function cannot import from
 * packages/. Tests hold them together: the files are identical and every case gives the same answer on both
 * sides. ZERO imports: the thresholds are passed in. Alerts are never gated by payment (MR9).
 */

export interface DangerThresholds {
  version: string;
  bp: { dangerTopAtLeast: number; dangerBottomAtLeast: number };
  sugar: { dangerLowBelow: number; dangerHighAtLeast: number };
  pulse: { dangerBelow: number; dangerAbove: number };
}

export type DangerKind = "very_high_bp" | "low_sugar" | "high_sugar" | "pulse";

export type DangerInput =
  | { kind: "bp"; top: number | null; bottom: number | null }
  | { kind: "sugar"; value: number | null }
  | { kind: "pulse"; value: number | null }
  | { kind: "weight"; value: number | null };

const filled = (n: number | null): n is number => typeof n === "number" && Number.isFinite(n);

/** The danger a reading is in, or null. Mirrors checkReading's "danger" branches exactly. */
export function dangerOf(input: DangerInput, t: DangerThresholds): DangerKind | null {
  switch (input.kind) {
    case "bp":
      if (!filled(input.top) || !filled(input.bottom)) return null;
      return input.top >= t.bp.dangerTopAtLeast || input.bottom >= t.bp.dangerBottomAtLeast
        ? "very_high_bp"
        : null;
    case "sugar":
      if (!filled(input.value)) return null;
      if (input.value < t.sugar.dangerLowBelow) return "low_sugar";
      return input.value >= t.sugar.dangerHighAtLeast ? "high_sugar" : null;
    case "pulse":
      if (!filled(input.value)) return null;
      return input.value < t.pulse.dangerBelow || input.value > t.pulse.dangerAbove
        ? "pulse"
        : null;
    case "weight":
      return null;
  }
}
