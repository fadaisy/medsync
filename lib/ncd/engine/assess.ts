/**
 * The protocol engine — pure, deterministic, disease-generic, no I/O.
 *
 * Every function returns VERDICT + EVIDENCE + CITATION + the standard applied,
 * never a bare verdict. Nothing here contains clinical content: the thresholds,
 * staging systems and caveats all come from the catalog, so hypertension and CKD
 * reuse this code unchanged.
 *
 * Two rules run through all of it:
 *   • absence of data is never a negative finding;
 *   • "cannot be done here" is never the same as "not done yet".
 */
import type {
  Citation,
  Complication,
  NcdCatalog,
  SiteProfile,
  StageDefinition,
  StageSeverity,
  StandardBody,
  ValidityCaveat,
} from "@/lib/ncd/catalog/schema";
import type {
  CaptureMap,
  CriterionResult,
  EvalContext,
  EvalState,
} from "@/lib/ncd/engine/evaluate";

import { preferredCriteria } from "@/lib/ncd/catalog/schema";
import {
  contextOf,
  evaluateAny,
  evaluateCriterion,
  evaluatePredicate,
  rollUpAny,
} from "@/lib/ncd/engine/evaluate";

export function ncdContext(
  catalog: NcdCatalog,
  values: CaptureMap,
  site: SiteProfile,
): EvalContext {
  return contextOf(catalog.features, values, site);
}

/* ── 1. the acute interlock ──────────────────────────────────────────────── */

export interface AcuteFlag {
  code: string;
  display: string;
  severity: "red" | "amber";
  action: string;
  /** The criterion that fired — the evidence trail. */
  via: CriterionResult;
  stage?: { code: string; display: string; severity: StageSeverity };
  citation: Citation;
}

const SEVERITY_RANK: Record<StageSeverity, number> = {
  critical: 0,
  severe: 1,
  moderate: 2,
  mild: 3,
  none: 4,
};

/**
 * Always-on. Runs regardless of whether the form is being used for a new
 * presentation or a routine review, because a review that quietly accepts a
 * glucose of 32 with ketones is worse than no review at all. Acute flags route
 * OUT to the resuscitation pathway; they are never checklist rows.
 */
export function acuteInterlock(catalog: NcdCatalog, ctx: EvalContext): AcuteFlag[] {
  const flags: AcuteFlag[] = [];
  for (const comp of catalog.complications) {
    if (comp.timing !== "acute" || !comp.emergency) continue;
    const results = evaluateAny(comp.establishedBy, ctx);
    const fired = results.find((r) => r.state === "met");
    if (!fired) continue;
    flags.push({
      code: comp.code,
      display: comp.display,
      severity: comp.emergency.severity,
      action: comp.emergency.action,
      via: fired,
      stage: firstStage(comp, ctx),
      citation: comp.emergency.citation,
    });
  }
  // Most severe first; red before amber.
  return flags.sort(
    (a, b) =>
      (a.severity === "red" ? 0 : 1) - (b.severity === "red" ? 0 : 1) ||
      SEVERITY_RANK[a.stage?.severity ?? "none"] - SEVERITY_RANK[b.stage?.severity ?? "none"],
  );
}

/** The most severe stage whose criterion is met. Catalog order is authoritative. */
function firstStage(
  comp: Complication,
  ctx: EvalContext,
): { code: string; display: string; severity: StageSeverity } | undefined {
  for (const system of comp.staging ?? []) {
    for (const stage of system.stages) {
      if (evaluateCriterion(stage.when, ctx).state === "met") {
        return { code: stage.code, display: stage.display, severity: stage.severity };
      }
    }
  }
  return undefined;
}

/* ── 1b. danger signs ────────────────────────────────────────────────────── */

export interface DangerSign {
  feature: string;
  display: string;
  severity: "red" | "amber";
  action: string;
  citation: Citation;
}

/**
 * Findings that demand urgent action on their own, without waiting for a
 * complication to be ESTABLISHED.
 *
 * This is the layer that works where the interlock cannot. DKA needs ketones and
 * acid-base to confirm; a clinic without either can never reach that verdict, and
 * would otherwise be told nothing at all. Vomiting with abdominal pain in a person
 * with diabetes is recordable anywhere, and is enough to say "this person needs to
 * be seen now".
 *
 * Fires only on a RECORDED positive — an unasked symptom raises nothing, and a
 * symptom recorded as absent raises nothing.
 */
export function dangerSigns(catalog: NcdCatalog, ctx: EvalContext): DangerSign[] {
  const out: DangerSign[] = [];
  for (const f of catalog.features) {
    const d = f.dangerSign;
    if (!d) continue;
    if (evaluatePredicate({ feature: f.code, op: "present" }, ctx).state !== "met") continue;
    out.push({
      feature: f.code,
      display: f.display,
      severity: d.severity,
      action: d.action,
      citation: d.citation,
    });
  }
  return out.sort((a, b) => (a.severity === "red" ? 0 : 1) - (b.severity === "red" ? 0 : 1));
}

/* ── 2. test validity ────────────────────────────────────────────────────── */

export interface ActiveCaveat {
  id: string;
  feature: string;
  label: string;
  direction: ValidityCaveat["direction"];
  alternative?: string;
  blocksDiagnosis: boolean;
  citation: Citation;
}

/** Caveats whose condition is currently MET. Never inferred from missing data. */
export function activeCaveats(catalog: NcdCatalog, ctx: EvalContext): ActiveCaveat[] {
  return (catalog.validityCaveats ?? [])
    .filter((v) => evaluateCriterion(v.when, ctx).state === "met")
    .map((v) => ({
      id: v.id,
      feature: v.feature,
      label: v.label,
      direction: v.direction,
      alternative: v.alternative,
      blocksDiagnosis: v.blocksDiagnosis,
      citation: v.citation,
    }));
}

/* ── 3. diagnosis ────────────────────────────────────────────────────────── */

export type DiagnosisState =
  | "established"
  | "criteria_met"
  | "not_met"
  | "insufficient"
  | "unavailable";

export interface DiagnosisResult {
  state: DiagnosisState;
  standard?: StandardBody;
  version?: string;
  criteria: CriterionResult[];
  /** Features that would settle an insufficient verdict. */
  missing: string[];
  blocked: { feature: string; capability: string }[];
  /**
   * Criteria that are satisfied but still await the guideline's confirmatory
   * result. A diagnosis resting only on these is NOT made.
   */
  pendingConfirmation: CriterionResult[];
  /** Caveats that BLOCKED a criterion from counting. */
  suppressed: ActiveCaveat[];
  citation?: Citation;
}

/**
 * `established` short-circuits everything: a patient already carrying the
 * diagnosis is not re-adjudicated, and the criteria are not re-demanded.
 *
 * Otherwise the site's preferred criteria set is evaluated — and any criterion
 * resting on a feature whose result is currently untrustworthy is EXCLUDED
 * rather than counted, which is decision (a) doing real work: an HbA1c of 7.2%
 * in a patient with iron deficiency must not diagnose anybody.
 */
export function diagnose(
  catalog: NcdCatalog,
  ctx: EvalContext,
  opts?: { established?: boolean },
): DiagnosisResult {
  const caveats = activeCaveats(catalog, ctx);
  if (opts?.established) {
    return {
      state: "established",
      criteria: [],
      missing: [],
      blocked: [],
      pendingConfirmation: [],
      suppressed: caveats,
    };
  }

  const set = preferredCriteria(catalog.diagnosis, ctx.site);
  if (!set) {
    return {
      state: "insufficient",
      criteria: [],
      missing: [],
      blocked: [],
      pendingConfirmation: [],
      suppressed: caveats,
    };
  }

  const blocking = new Set(caveats.filter((c) => c.blocksDiagnosis).map((c) => c.feature));
  const usable = set.anyOf.filter(
    (c) =>
      ![...(c.all ?? []), ...(c.any ?? []), ...(c.atLeast?.of ?? [])].some((p) =>
        blocking.has(p.feature),
      ),
  );

  const results = evaluateAny(usable, ctx);
  const roll = rollUpAny(results);

  /**
   * Confirmation, generically.
   *
   * Guidelines do not diagnose an asymptomatic person on one abnormal result.
   * WHO expresses that as "repeat on a subsequent day", which this catalog
   * encodes as a predicate. ADA expresses it as "two abnormal results, which may
   * come from different tests at the same time" — which is satisfied here by TWO
   * DISTINCT criteria being met, and that is exactly what ADA means by A1C+FPG
   * from one draw.
   *
   * So: a criterion flagged `requiresConfirmation` cannot carry a diagnosis
   * alone. Without this, a single fasting glucose diagnoses somebody, which no
   * standard permits.
   */
  const met = results.filter((r) => r.state === "met");
  const unconditional = met.filter((r) => !r.requiresConfirmation);
  const pending = met.filter((r) => r.requiresConfirmation);
  const confirmed = unconditional.length > 0 || pending.length >= 2;

  const state: DiagnosisState =
    roll === "met"
      ? confirmed
        ? "criteria_met"
        : "insufficient"
      : roll === "not_met"
        ? "not_met"
        : roll === "unavailable"
          ? "unavailable"
          : "insufficient";

  return {
    state,
    standard: set.standard,
    version: set.version,
    criteria: results,
    missing: [...new Set(results.flatMap((r) => r.missing))],
    blocked: dedupeBlocked(results),
    pendingConfirmation: confirmed ? [] : pending,
    suppressed: caveats.filter((c) => c.blocksDiagnosis),
    citation: set.citation,
  };
}

const dedupeBlocked = (rs: CriterionResult[]) =>
  rs
    .flatMap((r) => r.blocked)
    .filter((b, i, xs) => xs.findIndex((y) => y.feature === b.feature) === i);

/* ── 4. classification ───────────────────────────────────────────────────── */

export interface ClassificationResult {
  /** A catalog classification code, or `unclassified`. */
  code: string;
  display: string;
  supported: { code: string; display: string; via: CriterionResult }[];
  /** Tests that would settle it, with why they are not settling it now. */
  discriminators: { feature: string; state: EvalState }[];
  reason: string;
  citation?: Citation;
}

/**
 * Returns `unclassified` unless exactly ONE classification is supported and not
 * refuted. This is the ratified position, and it is deliberately conservative:
 * an inferred diabetes type drives real insulin decisions, and C-peptide and
 * islet antibodies are unavailable in most of the world, so a guess from
 * phenotype is worse than an honest blank.
 */
export function classify(catalog: NcdCatalog, ctx: EvalContext): ClassificationResult {
  const supported: { code: string; display: string; via: CriterionResult }[] = [];
  const discriminators: { feature: string; state: EvalState }[] = [];

  for (const cl of catalog.classifications ?? []) {
    const refuted = (cl.refutedBy ?? []).some((c) => evaluateCriterion(c, ctx).state === "met");
    const hit = evaluateAny(cl.supportedBy, ctx).find((r) => r.state === "met");
    if (hit && !refuted) supported.push({ code: cl.code, display: cl.display, via: hit });
    for (const d of cl.discriminators ?? []) {
      if (discriminators.some((x) => x.feature === d)) continue;
      discriminators.push({
        feature: d,
        state: evaluateCriterion(
          { id: `d:${d}`, label: d, all: [{ feature: d, op: "present" }], citation: FALLBACK_CITE },
          ctx,
        ).state,
      });
    }
  }

  if (supported.length === 1) {
    const only = supported[0]!;
    return {
      code: only.code,
      display: only.display,
      supported,
      discriminators,
      reason: only.via.label,
      citation: only.via.citation,
    };
  }
  return {
    code: "unclassified",
    display: "Unclassified",
    supported,
    discriminators,
    reason:
      supported.length > 1
        ? `More than one type is supported (${supported.map((s) => s.display).join(", ")}) — not classified.`
        : "The discriminating tests are not available or not done. Type is not inferred from phenotype.",
  };
}

/** Used only to probe a discriminator's capture state; never shown to a user. */
const FALLBACK_CITE: Citation = {
  standard: "local",
  version: "internal",
  title: "discriminator probe",
  needsCsoInput: "internal probe, not a clinical assertion",
  csoSigned: false,
};

/* ── 5. complications ────────────────────────────────────────────────────── */

export interface StageResult {
  system: string;
  display: string;
  standard: StandardBody;
  stage?: StageDefinition;
  state: EvalState;
  citation: Citation;
}

export interface ComplicationResult {
  code: string;
  display: string;
  timing: "acute" | "chronic";
  /** met = present · not_met = absent · insufficient / unavailable = not established. */
  state: EvalState;
  establishedBy: CriterionResult[];
  stages: StageResult[];
  /** Screening features not yet captured, and why. */
  unscreened: { feature: string; state: EvalState }[];
  screeningIntervalMonths?: number;
  citation: Citation;
}

export function assessComplications(catalog: NcdCatalog, ctx: EvalContext): ComplicationResult[] {
  return catalog.complications.map((comp) => {
    const established = evaluateAny(comp.establishedBy, ctx);
    const stages: StageResult[] = (comp.staging ?? []).map((sys) => {
      let hit: StageDefinition | undefined;
      let state: EvalState = "not_met";
      for (const stage of sys.stages) {
        const r = evaluateCriterion(stage.when, ctx);
        if (r.state === "met") {
          hit = stage;
          state = "met";
          break;
        }
        // Remember the least-committal reason we could not stage.
        if (r.state === "insufficient") state = "insufficient";
        else if (r.state === "unavailable" && state !== "insufficient") state = "unavailable";
      }
      return {
        system: sys.id,
        display: sys.display,
        standard: sys.standard,
        stage: hit,
        state,
        citation: sys.citation,
      };
    });

    const unscreened = comp.screenedBy
      .map((feature) => ({
        feature,
        state: evaluateCriterion(
          {
            id: `s:${feature}`,
            label: feature,
            all: [{ feature, op: "present" }],
            citation: FALLBACK_CITE,
          },
          ctx,
        ).state,
      }))
      .filter((x) => x.state === "insufficient" || x.state === "unavailable");

    const stagedCode = stages.find((s) => s.stage)?.stage?.code;
    const interval =
      comp.screeningIntervals?.find((i) => i.forStage === stagedCode) ??
      comp.screeningIntervals?.find((i) => !i.forStage);

    return {
      code: comp.code,
      display: comp.display,
      timing: comp.timing,
      state: rollUpAny(established),
      establishedBy: established,
      stages,
      unscreened,
      screeningIntervalMonths: interval?.months,
      citation: comp.citation,
    };
  });
}

/* ── 6. gaps ─────────────────────────────────────────────────────────────── */

export interface Gap {
  feature: string;
  display: string;
  /** `not_assessed` is a gap to close; `unavailable` is a referral to make. */
  kind: "not_assessed" | "unavailable";
  capability?: string;
  /** What the missing value is holding up. */
  blocks: string;
}

/**
 * What is missing, and — critically — WHY it is missing. Collapsing "not done"
 * into "cannot be done here" is how a gaps list becomes noise a clinician learns
 * to scroll past, so the two are kept apart all the way to the surface.
 */
export function gaps(
  catalog: NcdCatalog,
  dx: DiagnosisResult,
  complications: ComplicationResult[],
): Gap[] {
  const byCode = new Map(catalog.features.map((f) => [f.code, f]));
  const out = new Map<string, Gap>();
  const add = (feature: string, kind: Gap["kind"], blocks: string, capability?: string) => {
    if (out.has(feature)) return;
    const f = byCode.get(feature);
    if (!f) return;
    out.set(feature, { feature, display: f.display, kind, capability, blocks });
  };

  for (const m of dx.missing) add(m, "not_assessed", "Diagnosis");
  for (const b of dx.blocked) add(b.feature, "unavailable", "Diagnosis", b.capability);

  for (const c of complications) {
    if (c.timing === "acute") continue;
    for (const u of c.unscreened) {
      add(
        u.feature,
        u.state === "unavailable" ? "unavailable" : "not_assessed",
        c.display,
        byCode.get(u.feature)?.requires,
      );
    }
  }
  return [...out.values()];
}
