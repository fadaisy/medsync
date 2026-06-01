import type { SpecialPopulationModifiers, TriageVitals } from "../types";

import { NEWS2_PULSE, NEWS2_TEMPERATURE } from "../constants";
import { scoreBand } from "./bands";

/**
 * Special-population caution strings — pure, deterministic (catalog
 * Part E). These are CONFOUNDERS the clinician weighs, NOT new acuity
 * rules: each returns transparent caution text only and NEVER changes a
 * computed acuity (no fabricated thresholds — the catalog frames these
 * as "interpret with context", and the bias-up safety nets already live
 * in the scorers + discriminators). Over-triage bias: the cautions warn
 * against false reassurance, never against escalation.
 *
 * They are contextual — a caution only surfaces when the modifier could
 * actually mislead (e.g. the beta-blocker warning appears when the pulse
 * reads "normal" but it might be masking compensation).
 */
export function specialPopulationCautions(
  modifiers: SpecialPopulationModifiers | undefined,
  vitals: TriageVitals,
): string[] {
  if (!modifiers) return [];
  const out: string[] = [];

  const pulse = vitals.pulse;
  const temp = vitals.temperature;
  const pulsePoints = pulse !== null ? scoreBand(pulse, NEWS2_PULSE) : null;
  const tempPoints = temp !== null ? scoreBand(temp, NEWS2_TEMPERATURE) : null;

  // Elderly / frail — a normal temp doesn't exclude sepsis; confusion
  // may be the only sign; lower reserve → escalate earlier.
  if (modifiers.elderlyFrail) {
    out.push(
      "Elderly/frail: a normal temperature or heart rate does not exclude serious illness — lower reserve, escalate earlier; new confusion may be the only sign.",
    );
  }

  // Beta-blocker — a normal/low pulse may mask the tachycardia of
  // compensation; only worth flagging when the pulse looks reassuring.
  if (modifiers.betaBlocker && pulsePoints === 0) {
    out.push(
      "On a beta-blocker: a normal heart rate may be masking compensation — do not be falsely reassured by the pulse; weigh RR, BP, and shock index.",
    );
  }

  // Athlete — resting bradycardia can be normal IF well + asymptomatic.
  // Flag only when the pulse is the bradycardic NEWS2 band, so it reads
  // as "interpret in context", not "ignore".
  if (
    modifiers.athlete &&
    pulsePoints !== null &&
    pulsePoints > 0 &&
    pulse !== null &&
    pulse < 60
  ) {
    out.push(
      "Fit athlete: resting bradycardia can be normal in a well, asymptomatic person — interpret the low heart rate with symptoms and the rest of the picture.",
    );
  }

  // Chronic abnormal baseline — point the clinician at the audited
  // baseline-adjustment path rather than over-triaging a chronic value.
  if (modifiers.chronicAbnormalBaseline && (pulsePoints || tempPoints)) {
    out.push(
      "Chronic abnormal baseline: this reading may be normal for THIS patient — use the clinician baseline adjustment (audited; never below a fired red-flag) rather than treating a chronic value as acute.",
    );
  }

  return out;
}
