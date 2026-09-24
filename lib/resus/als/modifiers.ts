import type { ArrestContext, ArrestState, CauseTile } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { surveyActions } from "@/lib/resus/als/devices";
import { anaphylaxisAdrenalineText } from "@/lib/resus/als/drugs";
import {
  ADULT_MIN_AGE_YEARS,
  HYPOTHERMIA_UPPER_C,
  HYPOTHERMIA_WITHHOLD_BELOW_C,
  PE_LYSIS_CPR_MAX_MIN,
  PE_LYSIS_CPR_MIN_MIN,
  PERIPHERAL_PROMPT_BELOW_C,
} from "@/lib/resus/reference/als-catalog";

/**
 * ALS engine — special-circumstance modifiers (catalog §7, ALS-MOD-01..16). PURE.
 *
 * Temperature modifiers act on a CORE temperature only (ALS-MOD-06, D8): a peripheral or
 * site-unknown reading < 32 °C never withholds a drug — it prompts a core measurement.
 *
 * PE thrombolysis (ALS-MOD-11 / ALS-DRG-04) is recognised from the one place the desk records
 * it: the C-step action `c_thrombolysis` in state `performed` (no thrombolytic exists in the
 * emergency drug catalog — doses are NOT ENCODED — and the contract has no lysis decision).
 */

/** Age < 16 → clocks and logging only (ALS-MOD-16). Unknown age → adult rules. */
export const isPaediatric = (ctx: ArrestContext): boolean =>
  ctx.ageYears !== null && ctx.ageYears < ADULT_MIN_AGE_YEARS;

export type TempBand = "below_30" | "30_to_35" | "normal" | "peripheral_low" | "unknown";

/** The temperature band that drives ALS-MOD-01..06. */
export function tempBand(ctx: ArrestContext): TempBand {
  const core = ctx.coreTempC;
  if (core !== null) {
    if (core < HYPOTHERMIA_WITHHOLD_BELOW_C) return "below_30"; // ALS-MOD-01/02/03
    if (core <= HYPOTHERMIA_UPPER_C) return "30_to_35"; // ALS-MOD-04
    return "normal";
  }
  if (ctx.otherTempC !== null && ctx.otherTempC < PERIPHERAL_PROMPT_BELOW_C) {
    return "peripheral_low"; // ALS-MOD-06
  }
  return "unknown";
}

export const PE_LYSIS_ACTION_CODE = "c_thrombolysis";

/** When PE thrombolysis was last recorded performed in the episode (ALS-MOD-11), or null. */
export function peLysisAtMs(tl: readonly TimelineEvent[]): number | null {
  let at: number | null = null;
  for (const a of surveyActions(tl)) {
    if (a.code === PE_LYSIS_ACTION_CODE && a.performedAtMs !== null)
      at = Math.max(at ?? a.performedAtMs, a.performedAtMs);
  }
  return at;
}

/** ALS-MOD-07: pregnancy confirmed / postpartum with gestation > 20 weeks. */
export function pregnancyModifierActive(ctx: ArrestContext): boolean {
  const f = ctx.flags;
  return (
    (f.pregnancy === "confirmed" || f.pregnancy === "postpartum") &&
    f.gestationWeeks !== null &&
    f.gestationWeeks > 20
  );
}

type Modifier = ArrestState["modifiers"][number];

/** The active modifiers, in catalog order. Labels carry no adult number for a child. */
export function activeModifiers(
  ctx: ArrestContext,
  causes: readonly CauseTile[],
  lysisAtMs: number | null,
): Modifier[] {
  const child = isPaediatric(ctx);
  const f = ctx.flags;
  const out: Modifier[] = [];
  const band = tempBand(ctx);
  if (band === "below_30") {
    out.push({
      id: "hypothermia_below_30",
      label: child
        ? "Core temperature below 30 °C — rewarm; drug and shock timing changes (clocks only for a child)"
        : "Core < 30 °C — adrenaline withheld; after 3 shocks delay further shocks until core > 30 °C; amiodarone loading dose only",
      ruleIds: ["ALS-MOD-01", "ALS-MOD-02", "ALS-MOD-03", "ALS-MOD-05"],
    });
  } else if (band === "30_to_35") {
    out.push({
      id: "hypothermia_30_to_35",
      label: child
        ? "Hypothermia — rewarm (clocks only for a child)"
        : "Core 30–35 °C — adrenaline every 6–10 min",
      ruleIds: ["ALS-MOD-04", "ALS-MOD-05"],
    });
  } else if (band === "peripheral_low") {
    out.push({
      id: "temperature_not_core",
      label: "Low non-core temperature — measure core temperature now (low-reading thermometer)",
      ruleIds: ["ALS-MOD-06"],
    });
  }
  if (pregnancyModifierActive(ctx)) {
    out.push({
      id: "pregnancy",
      label:
        "Pregnancy > 20 weeks — manual left uterine displacement; seek the 4 Ps; prepare resuscitative hysterotomy early, perform as soon as possible",
      ruleIds: ["ALS-MOD-07"],
    });
  }
  if (f.trauma) {
    out.push({
      id: "trauma",
      label: "Trauma — treat reversible causes first (haemorrhage, airway, chest, tamponade)",
      ruleIds: ["ALS-MOD-08"],
    });
  }
  if (f.allergenTrigger) {
    out.push({
      id: "anaphylaxis",
      label: child
        ? "Anaphylaxis in arrest — follow ALS; IM prompt suppressed (weight-based — PLS module not built)"
        : `Anaphylaxis in arrest — follow ALS (${anaphylaxisAdrenalineText(ctx, band)}); IM prompt suppressed; early IV crystalloid bolus`,
      ruleIds: ["ALS-MOD-09", "ALS-DRG-06"],
    });
  }
  if (f.localAnaestheticToxicity) {
    out.push({
      id: "last",
      label: child
        ? "Local anaesthetic toxicity — weight-based (PLS module not built); plan prolonged resuscitation"
        : "Local anaesthetic toxicity — adrenaline ≤ 1 µg/kg (weight in the dialog); 20 % lipid; plan > 1 h resuscitation",
      ruleIds: ["ALS-MOD-10"],
    });
  }
  if (lysisAtMs !== null) {
    out.push({
      id: "pe_lysis",
      label: child
        ? "PE thrombolysis recorded — prolonged resuscitation (weight-based — PLS module not built)"
        : `PE thrombolysis recorded — consider CPR for ${PE_LYSIS_CPR_MIN_MIN}–${PE_LYSIS_CPR_MAX_MIN} min after administration`,
      ruleIds: ["ALS-MOD-11", "ALS-DRG-04"],
    });
  }
  const toxins = causes.find((c) => c.key === "toxins");
  if (toxins && (toxins.state === "suspected" || toxins.state === "treating")) {
    out.push({
      id: "prolonged",
      label: "Prolonged resuscitation (toxins)",
      ruleIds: ["ALS-MOD-12"],
    });
  }
  if (f.knownAsthma) {
    out.push({
      id: "asthma",
      label:
        "Known asthma — 100 % O₂; exclude tension pneumothorax and anaphylaxis; consider disconnection for hyperinflation",
      ruleIds: ["ALS-MOD-13"],
    });
  }
  if (f.renalDialysis) {
    out.push({
      id: "dialysis",
      label:
        "Haemodialysis — stop dialysis, return blood volume, disconnect unless defibrillation-proof",
      ruleIds: ["ALS-MOD-14"],
    });
  }
  if (f.bmiOver40) {
    out.push({
      id: "obesity",
      // ALS-MOD-16: a child gets no energies, so the energy half is adult-only.
      label: child ? "BMI > 40 — standard ALS" : "BMI > 40 — standard ALS, standard energy",
      ruleIds: ["ALS-MOD-15", "ALS-NRG-04"],
    });
  }
  if (child) {
    out.push({
      id: "paediatric",
      label:
        "Age < 16 — clocks and logging only; doses weight-based — PLS module not built; no energies",
      ruleIds: ["ALS-MOD-16"],
    });
  }
  return out;
}
