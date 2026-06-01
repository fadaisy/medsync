import type { AcuityColour, AcuityLevel, News2Result, TriageInput, TriageResult } from "./types";

import { ACUITY_TIERS, meowsToAcuity, news2ToAcuity } from "./constants";
import { computeCrossVitalRules } from "./scoring/cross-vital-rules";
import { computeDerivedMetrics } from "./scoring/derived";
import { assessEsiV5 } from "./scoring/esi-v5";
import { evaluateDiscriminators } from "./scoring/evaluate-discriminators";
import { screenLifeThreat } from "./scoring/life-threat";
import { scoreMeows } from "./scoring/meows";
import { scoreNews2 } from "./scoring/news2";
import { scorePaediatric } from "./scoring/paeds-scorer";
import { routePopulation } from "./scoring/routing";
import { specialPopulationCautions } from "./scoring/special-populations";

/**
 * The smart-triage engine — pure, deterministic orchestration of
 * Steps 0–6 (research doc §9). Composes the unit-tested scorers; adds
 * NO new thresholds. Same TriageInput always yields the same
 * TriageResult — medico-legally reproducible (kickoff §0.1).
 *
 *   Step 0  life-threat screen → Level 1, bypass scoring (resus)
 *   Step 1  population routing (adult / paediatric / obstetric)
 *   Step 2  objective score (NEWS2 for adult; paeds/obstetric compose
 *           from discriminators + derived metrics — see scope note)
 *   Step 3  discriminator evaluation (manual + derived)
 *   Step 4  WORSE-OF (score acuity vs discriminator acuity) — never avg
 *   Step 5  trend escalation + clinician-gated baseline temper (floored)
 *   Step 6  output: level + colour + target + disposition + reasoning
 *
 * Clinician override (Step 7) is a separate, audited action layered on
 * this result — it lives in the action/UI tier, not here, so the
 * computed result stays a pure function of its inputs.
 *
 * SCOPE NOTE (paeds/obstetric): the research doc does not provide the
 * full Brighton PEWS sub-rubric or MEOWS per-parameter colour cutoffs,
 * so those populations are NOT given a fabricated numeric score. They
 * are driven by Step-0, the discriminator layer (which includes the
 * obstetric/paediatric red-flags), and derived metrics — and the result
 * is marked provisional with a flag to assess manually. Supplying those
 * rubrics later slots a scorer into Step 2 behind this same interface.
 */

const DISPOSITION: Record<AcuityLevel, string> = {
  1: "Resus",
  2: "High-acuity",
  3: "Standard",
  4: "Standard / fast-track",
  5: "Fast-track",
};

export function runTriage(input: TriageInput): TriageResult {
  const reasoning: string[] = [];
  const flags: string[] = [];
  const derived = computeDerivedMetrics({
    pulse: input.vitals.pulse,
    systolicBp: input.vitals.systolicBp,
    diastolicBp: input.vitals.diastolicBp,
    respiratoryRate: input.vitals.respiratoryRate,
    consciousness: input.vitals.consciousness,
    bloodGlucose: input.vitals.bloodGlucose,
  });

  // ── Step 1 routing (computed first so a life-threat result still
  //    carries the correct ruleset label). ───────────────────────────
  const routing = routePopulation(input.context);
  flags.push(...routing.flags);

  // ── Step 0 — immediate life threat → bypass scoring. ──────────────
  const lifeThreat = screenLifeThreat(input.vitals, input.lifeThreatFlags ?? {});
  if (lifeThreat.isLifeThreat) {
    reasoning.push(`Step 0 life threat: ${lifeThreat.reasons.join("; ")} → Level 1, resus now.`);
    return finalize({
      ruleset: routing.ruleset,
      lifeThreat: true,
      lifeThreatReasons: lifeThreat.reasons,
      level: 1,
      scoreAcuity: null,
      news2: null,
      derived,
      firedDiscriminators: [],
      discriminatorAcuity: null,
      trendEscalated: false,
      baselineApplied: false,
      incompleteVitals: false,
      missingRequiredVitals: [],
      dangerVitals: [],
      esiV5Acuity: null,
      provisional: false,
      reasoning,
      flags,
    });
  }

  // ── ESI v5 — mandatory vitals + danger-zone reassess-up (ENA 2023).
  //    Required HR/RR/SpO₂ for any non-L1/L2 patient; a danger-zone
  //    vital floors acuity up. Folds into the worse-of below.
  const esi = assessEsiV5({
    respiratoryRate: input.vitals.respiratoryRate,
    pulse: input.vitals.pulse,
    spo2: input.vitals.spo2,
    // ESI adult HR/RR danger-zone (HR>100, RR>20) over-flags children —
    // gate it to adults. SpO₂<92 + the mandatory-vitals floor stay on.
    adultDangerZone: routing.ruleset === "adult_news2",
  });
  if (esi.dangerVitals.length > 0) {
    reasoning.push(`ESI v5 danger-zone vital(s): ${esi.dangerVitals.join(", ")} → minimum L2.`);
  }
  if (esi.incompleteVitals) {
    flags.push(
      `Assessment incomplete — obtain ${esi.missingRequired.join(", ")} (ESI v5 requires HR/RR/SpO₂).`,
    );
  }

  // ── Step 2 — objective score (adult only; see scope note). ────────
  let news2: News2Result | null = null;
  let scoreAcuity: AcuityLevel | null = null;
  let provisional = false;
  if (routing.ruleset === "adult_news2") {
    news2 = scoreNews2({
      respiratoryRate: input.vitals.respiratoryRate,
      spo2: input.vitals.spo2,
      spo2Scale: input.context.spo2Scale2Enabled ? "scale2" : "scale1",
      oxygen: input.vitals.oxygen,
      systolicBp: input.vitals.systolicBp,
      pulse: input.vitals.pulse,
      consciousness: input.vitals.consciousness,
      temperature: input.vitals.temperature,
    });
    scoreAcuity = news2ToAcuity(news2.total, news2.hasSingleParameterThree);
    provisional = news2.provisional;
    reasoning.push(
      `NEWS2 ${news2.total}${news2.hasSingleParameterThree ? " (single-parameter 3)" : ""} → acuity ${scoreAcuity}.`,
    );
    for (const p of news2.parameters) {
      if (p.points > 0) reasoning.push(`  ${p.parameter}: ${p.band}`);
    }
  } else if (routing.ruleset === "paediatric_pews") {
    // Paediatric: age-banded scorer from the CSO catalog (Part C).
    const paeds = scorePaediatric({
      ageYears: input.context.ageYears ?? 0,
      respiratoryRate: input.vitals.respiratoryRate,
      heartRate: input.vitals.pulse,
      systolicBp: input.vitals.systolicBp,
      spo2: input.vitals.spo2,
      temperature: input.vitals.temperature,
      bloodGlucose: input.vitals.bloodGlucose,
    });
    scoreAcuity = paeds.acuity;
    provisional = paeds.provisional;
    reasoning.push(`Paediatric (age-banded) → acuity ${scoreAcuity}.`);
    for (const r of paeds.reasons) reasoning.push(`  ${r}`);
    if (paeds.missing.length > 0) {
      flags.push(`Paediatric assessment incomplete — obtain ${paeds.missing.join(", ")}.`);
    }
  } else {
    // Obstetric: MEOWS scorer from the CSO catalog (Part D).
    const meows = scoreMeows({
      systolicBp: input.vitals.systolicBp,
      diastolicBp: input.vitals.diastolicBp,
      temperature: input.vitals.temperature,
      spo2: input.vitals.spo2,
      modifiedShockIndexFlag: derived.modifiedShockIndexFlag,
    });
    scoreAcuity = meowsToAcuity(meows.redCount, meows.yellowCount);
    provisional = meows.provisional;
    reasoning.push(`MEOWS ${meows.redCount}R/${meows.yellowCount}Y → acuity ${scoreAcuity}.`);
    for (const r of meows.reasons) reasoning.push(`  ${r}`);
    if (meows.missing.length > 0) {
      flags.push(`Obstetric MEOWS provisional — obtain ${meows.missing.join(", ")}.`);
    }
  }

  // Surface derived "smart" metrics in the reasoning (transparency).
  if (derived.shockIndexFlag && derived.shockIndexFlag !== "normal") {
    reasoning.push(`Shock Index ${derived.shockIndex?.toFixed(2)} (${derived.shockIndexFlag}).`);
  }
  if (derived.modifiedShockIndexFlag === "haemorrhage") {
    reasoning.push(
      `Modified Shock Index ${derived.modifiedShockIndex?.toFixed(2)} (haemorrhage — concealed-bleed catch).`,
    );
  }
  if (derived.qsofa && derived.qsofa.score >= 2) {
    reasoning.push(`qSOFA ${derived.qsofa.score} — sepsis overlay positive.`);
  }
  if (derived.glucoseFlag && derived.glucoseFlag !== "normal") {
    reasoning.push(`Glucose flag: ${derived.glucoseFlag}.`);
  }

  // ── Cross-vital "smart layer" rules (catalog Part F). ─────────────
  //   Patterns that only mean something read together: Cushing's reflex
  //   (→ L1 floor), temp+HR sepsis overlay, pulse-pressure strings, and
  //   the SpO₂+RR "will fail" raise-only floor. Pure; null-guarded.
  //   Computed before discriminators so the temp+HR overlay can widen
  //   the sepsis gate.
  const crossVital = computeCrossVitalRules(
    input.vitals,
    derived,
    input.lifeThreatFlags ?? {},
    routing.ruleset,
    input.context.ageYears,
  );
  for (const c of crossVital) {
    if (c.interpretation) reasoning.push(c.interpretation);
  }
  const cushings = crossVital.find((c) => c.code === "cushings_reflex");
  const willFail = crossVital.find((c) => c.code === "spo2_rr_will_fail");
  const tempHrSepsis = crossVital.some((c) => c.code === "temp_hr_sepsis");

  // ── Step 3 — discriminators. ──────────────────────────────────────
  const disc = evaluateDiscriminators({
    ruleset: routing.ruleset,
    vitals: input.vitals,
    derived,
    news2Total: news2?.total ?? 0,
    presentCodes: input.presentDiscriminators ?? [],
    tempHrSepsisOverlay: tempHrSepsis,
  });
  for (const f of disc.fired) {
    reasoning.push(`Discriminator: ${f.label} → minimum acuity ${f.minAcuity} (${f.source}).`);
  }

  // ── Step 4 — WORSE-OF (lowest number wins). ───────────────────────
  //   (a) physiological score, (b) discriminator red-flag, (c) ESI v5
  //   mandatory-vitals/danger-zone floor, (d) cross-vital escalations.
  const candidates: AcuityLevel[] = [];
  if (scoreAcuity !== null) candidates.push(scoreAcuity);
  if (disc.minAcuity !== null) candidates.push(disc.minAcuity);
  if (esi.acuityFloor !== null) candidates.push(esi.acuityFloor);
  if (cushings?.acuityImplication != null) candidates.push(cushings.acuityImplication);
  // No signal at all (paeds/obstetric, nothing fired) → provisional Yellow,
  // bias-up default pending manual assessment.
  let level: AcuityLevel = candidates.length > 0 ? (Math.min(...candidates) as AcuityLevel) : 3;
  if (candidates.length === 0) {
    reasoning.push("No numeric score or red-flag — provisional Yellow pending manual assessment.");
  } else {
    reasoning.push(
      `Worse-of(score ${scoreAcuity ?? "—"}, discriminator ${disc.minAcuity ?? "—"}, ESI-v5 ${esi.acuityFloor ?? "—"}) → ${level}.`,
    );
  }

  // SpO₂+RR "will fail": a raise-only floor — a normal SpO₂ masking a
  // high RR may not read reassuring (L4/L5), but it never overwrites a
  // more-acute level from another track.
  if (willFail?.acuityImplication != null && level > willFail.acuityImplication) {
    level = willFail.acuityImplication;
    reasoning.push(`Raised to L${level}: normal SpO₂ with high RR cannot read reassuring.`);
  }

  // The absolute floor a baseline temper can never cross: a fired
  // red-flag discriminator OR an ESI-v5 danger-zone vital (Step-0
  // life-threat already returned above). Take the most acute of the two.
  const floorCandidates: AcuityLevel[] = [];
  if (disc.minAcuity !== null) floorCandidates.push(disc.minAcuity);
  // Only the DANGER floor (L2) is absolute; an incomplete-vitals floor
  // (L3) is a "needs assessment" default, not a hard red-flag, so it
  // does not block a clinician-reasoned baseline temper.
  if (esi.dangerVitals.length > 0 && esi.acuityFloor !== null)
    floorCandidates.push(esi.acuityFloor);
  // Cushing's reflex (raised ICP) is an absolute floor — a baseline
  // temper can never soften it.
  if (cushings?.acuityImplication != null) floorCandidates.push(cushings.acuityImplication);
  const floor = floorCandidates.length > 0 ? (Math.min(...floorCandidates) as AcuityLevel) : null;

  // ── Step 5 — trend escalation (never auto-improve). ───────────────
  // NOTE (catalog Part G): numeric rate-of-change (vitals worsening over
  // minutes–hours) is DEFERRED — the engine receives only priorLevel,
  // not timestamped prior vitals, so a real rate signal can't be derived
  // without fabricating one. The direction-of-trend safety net below
  // (prior level worse than snapshot → escalate, never auto-improve) is
  // in place; rate-of-change lands when timestamped prior vitals are
  // plumbed through.
  let trendEscalated = false;
  const prior = input.adjustments?.priorLevel ?? null;
  if (prior !== null && prior < level) {
    reasoning.push(
      `Trend: prior acuity ${prior} more acute than snapshot ${level} → escalate to ${prior}.`,
    );
    level = prior;
    trendEscalated = true;
  }

  // Special-population cautions (catalog Part E) — confounder warnings
  // only; they never change the acuity, just guard against false
  // reassurance (elderly, beta-blocker, athlete, chronic baseline).
  for (const caution of specialPopulationCautions(input.context.modifiers, input.vitals)) {
    flags.push(caution);
  }

  // ── Step 5 — clinician-gated baseline temper (floored). ───────────
  let baselineApplied = false;
  const baseline = input.adjustments?.baselineAdjustment ?? null;
  if (baseline) {
    const wantsGentler = baseline.temperToLevel > level;
    const violatesFloor = floor !== null && baseline.temperToLevel > floor;
    if (wantsGentler && !violatesFloor) {
      reasoning.push(`Baseline temper to ${baseline.temperToLevel}: ${baseline.reason}.`);
      level = baseline.temperToLevel;
      baselineApplied = true;
    } else {
      reasoning.push(
        `Baseline temper to ${baseline.temperToLevel} REFUSED — ${violatesFloor ? "cannot go below a fired red-flag" : "would escalate, not temper"}.`,
      );
    }
  }

  return finalize({
    ruleset: routing.ruleset,
    lifeThreat: false,
    lifeThreatReasons: [],
    level,
    scoreAcuity,
    news2,
    derived,
    firedDiscriminators: disc.fired,
    discriminatorAcuity: disc.minAcuity,
    trendEscalated,
    baselineApplied,
    incompleteVitals: esi.incompleteVitals,
    missingRequiredVitals: esi.missingRequired,
    dangerVitals: esi.dangerVitals,
    esiV5Acuity: esi.acuityFloor,
    provisional: provisional || esi.incompleteVitals,
    reasoning,
    flags,
  });
}

/** Attach colour / target / disposition from the ratified 5-tier model. */
function finalize(
  partial: Omit<TriageResult, "colour" | "targetMinutes" | "disposition">,
): TriageResult {
  const tier = ACUITY_TIERS.find((t) => t.level === partial.level)!;
  return {
    ...partial,
    colour: tier.colour as AcuityColour,
    targetMinutes: tier.targetMinutes,
    disposition: DISPOSITION[partial.level],
  };
}
