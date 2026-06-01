import type { AcuityColour, AcuityLevel, News2Result, TriageInput, TriageResult } from "./types";

import { ACUITY_TIERS, news2ToAcuity } from "./constants";
import { computeDerivedMetrics } from "./scoring/derived";
import { assessEsiV5 } from "./scoring/esi-v5";
import { evaluateDiscriminators } from "./scoring/evaluate-discriminators";
import { screenLifeThreat } from "./scoring/life-threat";
import { scoreNews2 } from "./scoring/news2";
import { routePopulation } from "./scoring/routing";

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
  } else {
    // Paeds/obstetric: no fabricated numeric score (scope note).
    provisional = true;
    flags.push(
      `${routing.ruleset === "paediatric_pews" ? "Paediatric" : "Obstetric"} score not auto-computed — assess against the ${routing.ruleset === "paediatric_pews" ? "PEWS" : "MEOWS"} chart manually; red-flags + derived metrics applied.`,
    );
  }

  // Surface derived "smart" metrics in the reasoning (transparency).
  if (derived.shockIndexFlag && derived.shockIndexFlag !== "normal") {
    reasoning.push(`Shock Index ${derived.shockIndex?.toFixed(2)} (${derived.shockIndexFlag}).`);
  }
  if (derived.qsofa && derived.qsofa.score >= 2) {
    reasoning.push(`qSOFA ${derived.qsofa.score} — sepsis overlay positive.`);
  }
  if (derived.glucoseFlag && derived.glucoseFlag !== "normal") {
    reasoning.push(`Glucose flag: ${derived.glucoseFlag}.`);
  }

  // ── Step 3 — discriminators. ──────────────────────────────────────
  const disc = evaluateDiscriminators({
    ruleset: routing.ruleset,
    vitals: input.vitals,
    derived,
    news2Total: news2?.total ?? 0,
    presentCodes: input.presentDiscriminators ?? [],
  });
  for (const f of disc.fired) {
    reasoning.push(`Discriminator: ${f.label} → minimum acuity ${f.minAcuity} (${f.source}).`);
  }

  // ── Step 4 — WORSE-OF (lowest number wins; three tracks). ─────────
  //   (a) physiological score, (b) discriminator red-flag, (c) ESI v5
  //   mandatory-vitals/danger-zone floor. Take the most acute.
  const candidates: AcuityLevel[] = [];
  if (scoreAcuity !== null) candidates.push(scoreAcuity);
  if (disc.minAcuity !== null) candidates.push(disc.minAcuity);
  if (esi.acuityFloor !== null) candidates.push(esi.acuityFloor);
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
  const floor = floorCandidates.length > 0 ? (Math.min(...floorCandidates) as AcuityLevel) : null;

  // ── Step 5 — trend escalation (never auto-improve). ───────────────
  let trendEscalated = false;
  const prior = input.adjustments?.priorLevel ?? null;
  if (prior !== null && prior < level) {
    reasoning.push(
      `Trend: prior acuity ${prior} more acute than snapshot ${level} → escalate to ${prior}.`,
    );
    level = prior;
    trendEscalated = true;
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
