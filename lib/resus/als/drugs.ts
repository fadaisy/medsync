import type { RhythmEntry } from "@/lib/resus/als/eligibility";
import type { TempBand } from "@/lib/resus/als/modifiers";
import type { ArrestSlice } from "@/lib/resus/als/timing";
import type { ArrestContext, ArrestState } from "@/lib/resus/model";

import { isArrestDose, isNonShockable } from "@/lib/resus/als/eligibility";
import { tMs } from "@/lib/resus/als/timing";
import {
  ADRENALINE_AFTER_SHOCKS,
  ADRENALINE_DOSE_TEXT,
  ADRENALINE_OPEN_MS,
  ADRENALINE_OVERDUE_MS,
  AMIODARONE_FIRST_MG,
  AMIODARONE_SECOND_MG,
  ANTIARRHYTHMIC_FIRST_AFTER_SHOCKS,
  ANTIARRHYTHMIC_SECOND_AFTER_SHOCKS,
  HYPOTHERMIC_ADRENALINE_OPEN_MS,
  HYPOTHERMIC_ADRENALINE_OVERDUE_MS,
  LIDOCAINE_FIRST_MG,
  LIDOCAINE_SECOND_MG,
} from "@/lib/resus/reference/als-catalog";

/**
 * ALS engine — adrenaline window and antiarrhythmic eligibility. PURE.
 *
 * Catalog: ALS-ADR-01..05, ALS-AA-01..04, ALS-MOD-01/03/04/06/10/16. The console shows what
 * is due; it never administers. A child (< 16) gets no dose and no number (ALS-MOD-16).
 */

const CHILD_REASON = "Weight-based — PLS module not built";
const LAST_DOSE_TEXT = "≤ 1 µg/kg — use the dialog with weight";

export interface DrugInputs {
  slice: ArrestSlice;
  inArrest: boolean;
  rhythms: readonly RhythmEntry[];
  /** Times of the counted shocks (stacked = one), in order. */
  shockTimes: readonly number[];
  ctx: ArrestContext;
  paediatric: boolean;
  band: TempBand;
  nowMs: number;
}

/**
 * The adult arrest adrenaline dose text for this context — the ONE source for every string
 * that names it (ALS-DRG-06 follows ALS): null while withheld below 30 °C (ALS-MOD-01),
 * ≤ 1 µg/kg with local anaesthetic toxicity (ALS-MOD-10), else 1 mg IV.
 */
export function adrenalineDoseText(ctx: ArrestContext, band: TempBand): string | null {
  if (band === "below_30") return null;
  return ctx.flags.localAnaestheticToxicity ? LAST_DOSE_TEXT : ADRENALINE_DOSE_TEXT;
}

/** "adrenaline …" for the anaphylaxis bar in arrest: it follows ALS, never a fixed 1 mg. */
export function anaphylaxisAdrenalineText(ctx: ArrestContext, band: TempBand): string {
  const dose = adrenalineDoseText(ctx, band);
  return dose === null ? "adrenaline withheld while core < 30 °C" : `adrenaline ${dose}`;
}

export const isAdrenalineDose = (e: ArrestSlice["events"][number]) =>
  isArrestDose(e, "adrenaline_arrest_iv", "adrenaline");

/** The adrenaline block of ArrestState. */
export function adrenalineState(d: DrugInputs): ArrestState["adrenaline"] {
  const doses = d.slice.events.filter(isAdrenalineDose);
  const lastAtMs = doses.length ? tMs(doses[doses.length - 1]!) : null;
  const base = { doses: doses.length, lastAtMs, opensAtMs: null, overdueAtMs: null };
  if (d.paediatric) {
    return { ...base, status: "suppressed_child", reason: CHILD_REASON, ruleIds: ["ALS-MOD-16"] };
  }
  if (!d.inArrest) {
    return { ...base, status: "not_yet_eligible", reason: "No arrest in progress", ruleIds: [] };
  }
  if (d.band === "below_30") {
    return {
      ...base,
      status: "withheld",
      reason: `Core < 30 °C — withhold adrenaline; give ${ADRENALINE_DOSE_TEXT} once core reaches 30 °C`,
      ruleIds: ["ALS-MOD-01"],
    };
  }
  const doseText = adrenalineDoseText(d.ctx, d.band)!;
  const extra: string[] = d.ctx.flags.localAnaestheticToxicity ? ["ALS-MOD-10"] : [];
  if (d.band === "peripheral_low") extra.push("ALS-MOD-06");

  if (lastAtMs === null) {
    const nonShock = d.rhythms.find((r) => isNonShockable(r.rhythm));
    const third = d.shockTimes[ADRENALINE_AFTER_SHOCKS - 1] ?? null;
    if (nonShock || third !== null) {
      const ruleIds: string[] = [];
      if (nonShock) {
        ruleIds.push("ALS-ADR-02");
        // Shockable → non-shockable before the 3rd shock (ALS-ADR-05).
        if (d.rhythms.some((r) => r.rhythm === "vf_pvt" && r.atMs <= nonShock.atMs))
          ruleIds.push("ALS-ADR-05");
      }
      if (third !== null) ruleIds.push("ALS-ADR-01");
      const opensAtMs = Math.min(nonShock?.atMs ?? Infinity, third ?? Infinity);
      const why = nonShock ? "non-shockable rhythm" : "after the 3rd shock";
      return {
        ...base,
        opensAtMs,
        status: "due_now",
        reason: `Adrenaline ${doseText} now — ${why}`,
        ruleIds: [...ruleIds, ...extra],
      };
    }
    const current = d.rhythms[d.rhythms.length - 1]?.rhythm ?? null;
    return {
      ...base,
      status: "not_yet_eligible",
      reason:
        current === null
          ? "Rhythm not yet checked — shockable: after the 3rd shock; non-shockable: as soon as possible"
          : "Shockable rhythm: after the 3rd shock",
      ruleIds: ["ALS-ADR-01", ...extra],
    };
  }

  const extended = d.band === "30_to_35"; // ALS-MOD-04
  const opensAtMs = lastAtMs + (extended ? HYPOTHERMIC_ADRENALINE_OPEN_MS : ADRENALINE_OPEN_MS);
  const overdueAtMs =
    lastAtMs + (extended ? HYPOTHERMIC_ADRENALINE_OVERDUE_MS : ADRENALINE_OVERDUE_MS);
  const status =
    d.nowMs < opensAtMs ? "waiting" : d.nowMs <= overdueAtMs ? "window_open" : "overdue";
  const interval = extended
    ? "every 6–10 min (core 30–35 °C)"
    : "every 3–5 min (about every second loop)";
  return {
    ...base,
    opensAtMs,
    overdueAtMs,
    status,
    reason: `Repeat adrenaline ${doseText} ${interval}`,
    ruleIds: ["ALS-ADR-03", ...(extended ? ["ALS-MOD-04"] : ["ALS-ADR-04"]), ...extra],
  };
}

const AA = {
  amiodarone: {
    id: "amiodarone_arrest_iv",
    first: AMIODARONE_FIRST_MG,
    second: AMIODARONE_SECOND_MG,
    rules: ["ALS-AA-01", "ALS-AA-02"],
  },
  lidocaine: {
    id: "lidocaine_arrest_iv",
    first: LIDOCAINE_FIRST_MG,
    second: LIDOCAINE_SECOND_MG,
    rules: ["ALS-AA-03", "ALS-AA-03"],
  },
} as const;
type AaDrug = keyof typeof AA;

/**
 * The antiarrhythmic block of ArrestState (ALS-AA-01..04). Only one antiarrhythmic per
 * arrest: if the other one has already been given, it is the one tracked. ALS-MOD-03 is
 * signed for amiodarone only; lidocaine below 30 °C or with local anaesthetic toxicity has
 * no signed rule, so no lidocaine dose is shown there (catalog gap — CSO row pending).
 */
export function antiarrhythmicState(d: DrugInputs): ArrestState["antiarrhythmic"] {
  const given = d.slice.events.find(
    (e) =>
      isArrestDose(e, AA.amiodarone.id, "amiodarone") ||
      isArrestDose(e, AA.lidocaine.id, "lidocaine"),
  );
  const drug: AaDrug = given
    ? isArrestDose(given, AA.amiodarone.id, "amiodarone")
      ? "amiodarone"
      : "lidocaine"
    : d.ctx.antiarrhythmic;
  const spec = AA[drug];
  const dosesGiven = d.slice.events.filter((e) => isArrestDose(e, spec.id, drug)).length;
  const name = drug === "amiodarone" ? "Amiodarone" : "Lidocaine";
  const base = { drug, dosesGiven, nextDoseMg: null };
  if (d.paediatric) {
    return { ...base, status: "suppressed_child", reason: CHILD_REASON, ruleIds: ["ALS-MOD-16"] };
  }
  if (!d.inArrest) {
    return { ...base, status: "not_eligible", reason: "No arrest in progress", ruleIds: [] };
  }
  if (dosesGiven >= 2) {
    return {
      ...base,
      status: "complete",
      reason: `${name}: both doses given`,
      ruleIds: [spec.rules[1]],
    };
  }
  const count = d.shockTimes.length;
  const vf = d.rhythms[d.rhythms.length - 1]?.rhythm === "vf_pvt";
  const cold = d.band === "below_30";
  const unsigned: ArrestState["antiarrhythmic"] | null =
    drug !== "lidocaine"
      ? null
      : d.ctx.flags.localAnaestheticToxicity
        ? {
            ...base,
            status: "not_eligible",
            reason:
              "Local anaesthetic toxicity — no signed lidocaine rule; no dose shown (senior decision)",
            ruleIds: ["ALS-AA-04", "ALS-MOD-10"],
          }
        : cold
          ? {
              ...base,
              status: "delayed_hypothermia",
              reason: "Core < 30 °C — no signed lidocaine rule; no dose shown (senior decision)",
              ruleIds: ["ALS-AA-04"],
            }
          : null;
  if (dosesGiven === 0) {
    if (count >= ANTIARRHYTHMIC_FIRST_AFTER_SHOCKS && vf) {
      if (unsigned) return unsigned;
      return {
        ...base,
        nextDoseMg: spec.first,
        status: "due",
        reason: `${name} ${spec.first} mg IV — after 3 shocks${cold ? " (loading dose; further doses delayed until core > 30 °C)" : ""}`,
        ruleIds: [spec.rules[0], "ALS-AA-04", ...(cold ? ["ALS-MOD-03"] : [])],
      };
    }
    return {
      ...base,
      status: "not_eligible",
      reason: "After the 3rd shock in VF/pVT",
      ruleIds: ["ALS-AA-04"],
    };
  }
  if (count >= ANTIARRHYTHMIC_SECOND_AFTER_SHOCKS && vf) {
    if (unsigned) return unsigned;
    if (cold) {
      return {
        ...base,
        status: "delayed_hypothermia",
        reason: "Further antiarrhythmic delayed until core > 30 °C",
        ruleIds: ["ALS-MOD-03"],
      };
    }
    return {
      ...base,
      nextDoseMg: spec.second,
      status: "due",
      reason: `${name} ${spec.second} mg IV — after 5 shocks`,
      ruleIds: [spec.rules[1], "ALS-AA-04"],
    };
  }
  return {
    ...base,
    status: "not_eligible",
    reason: "Next dose after the 5th shock in VF/pVT",
    ruleIds: ["ALS-AA-04"],
  };
}
