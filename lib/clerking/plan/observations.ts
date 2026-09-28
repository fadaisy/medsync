/**
 * Observation frequency against NEWS2 (ADR 0184 §1). The response bands are the signed reference
 * entries CO-NEWS-01..05 (RCP 2017, GATE A 23 Sep 2026), read here, never retyped.
 */
import type { ObsFrequencyChoice } from "./draft";
import type { RefEntry } from "@/lib/resus/reference/ref";

import {
  CLOSEOUT_REF,
  NEWS2_EMERGENCY_MIN,
  NEWS2_URGENT_MIN,
} from "@/lib/resus/reference/levels-of-care";

export const OBS_WORD: Record<ObsFrequencyChoice, string> = {
  continuous: "Continuous",
  hourly: "Hourly",
  "4h": "4-hourly",
  "12h": "12-hourly",
};

/** Most to least often. */
export const OBS_RANK: Record<ObsFrequencyChoice, number> = {
  continuous: 0,
  hourly: 1,
  "4h": 2,
  "12h": 3,
};

export interface News2Now {
  total: number;
  singleThree: boolean;
  /** Some inputs missing: the score is provisional. */
  provisional: boolean;
}

export interface ObsRequirement {
  /** The least often the signed response allows, as one of the Plan's choices. */
  frequency: ObsFrequencyChoice;
  ref: RefEntry;
}

/**
 * CO-NEWS-01 ≥ 7 continuous; CO-NEWS-02 5 or more, at least hourly; CO-NEWS-03 a single 3, at
 * least hourly; CO-NEWS-04 1–4, at least 4–6-hourly (4-hourly meets it); CO-NEWS-05 0, at least
 * 12-hourly.
 */
export function requiredObservation(n: News2Now | null): ObsRequirement | null {
  if (!n) return null;
  const ref = (id: string) => CLOSEOUT_REF[id]!;
  if (n.total >= NEWS2_EMERGENCY_MIN) return { frequency: "continuous", ref: ref("CO-NEWS-01") };
  if (n.total >= NEWS2_URGENT_MIN) return { frequency: "hourly", ref: ref("CO-NEWS-02") };
  if (n.singleThree) return { frequency: "hourly", ref: ref("CO-NEWS-03") };
  if (n.total >= 1) return { frequency: "4h", ref: ref("CO-NEWS-04") };
  return { frequency: "12h", ref: ref("CO-NEWS-05") };
}

/** The chosen frequency is less often than NEWS2 calls for: the Plan asks why. */
export function lessOftenThanRequired(
  choice: ObsFrequencyChoice | undefined,
  req: ObsRequirement | null,
): boolean {
  return !!choice && !!req && OBS_RANK[choice] > OBS_RANK[req.frequency];
}

/** The RCP 2017 line shown for NEWS2 5–6 (the urgent band, below the emergency band). */
export function urgentBandLine(n: News2Now | null): RefEntry | null {
  return n && n.total >= NEWS2_URGENT_MIN && n.total < NEWS2_EMERGENCY_MIN
    ? CLOSEOUT_REF["CO-NEWS-02"]!
    : null;
}

/** Discharging with NEWS2 of 5 or more is a caution (and for an intern, a senior must agree). */
export const dischargeCaution = (n: News2Now | null) => !!n && n.total >= NEWS2_URGENT_MIN;
