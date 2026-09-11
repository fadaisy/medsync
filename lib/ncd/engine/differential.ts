/**
 * The examination discrimination layer (ADR 0083) — pure, deterministic, and
 * evaluated entirely on-device. No I/O, no clinical content, no model call.
 *
 * ── What this is, and what it deliberately is not ────────────────────────────
 *
 * ADR 0082 argued against a differential engine, and that argument still holds
 * for the thing it was about: an open-ended "what could this be?" across all of
 * medicine, tuned by hand, never finishable. This is the narrow case that
 * argument does not cover — ordering a CLOSED set of conditions the catalog
 * already names, so that HHS can sit above DKA in the older adult with no
 * ketosis, and so a recorded NEGATIVE can argue against something.
 *
 * Three properties make that safe, and all three are structural:
 *
 *   1. THE SET IS BOUNDED. Only `catalog.conditions` can be ranked. A mimic
 *      outside diabetes is a string to exclude, never a rankable code, so the
 *      engine cannot imply it is reasoning about conditions it has no criteria
 *      for.
 *
 *   2. THE OUTPUT IS AN ORDER, NOT A PROBABILITY. The integers below are a
 *      fixed, disease-generic ladder — identical for every catalog, never
 *      tuned, never stored, never rendered. They sort a list. `score` is
 *      exported for tests and for stable sorting, and the surface is forbidden
 *      to display it.
 *
 *   3. EVERY RANK CARRIES ITS EVIDENCE. A `RankedCondition` cannot be
 *      constructed without the finding codes that raised it and the finding
 *      codes that argued against it. There is no path through this module that
 *      produces an unexplained ranking.
 *
 * ── Rank and confidence are different questions ──────────────────────────────
 *
 * Three findings can produce a perfectly clear ORDER and still not be enough to
 * act on. Conflating the two is how a tool built on four answered questions
 * looks as assured as one built on forty, which is the same failure
 * `Completeness` exists to prevent — so confidence is computed separately and
 * reported alongside, never folded into the ranking.
 */
import type {
  AgeBand,
  Citation,
  DifferentialCondition,
  Discrimination,
  DiscriminationStrength,
  Feature,
  NcdCatalog,
  Posterior,
  Urgency,
} from "@/lib/ncd/catalog/schema";
import type { CriterionResult, EvalContext } from "@/lib/ncd/engine/evaluate";

import { isPerformable } from "@/lib/ncd/catalog/schema";
import { evaluateCriterion } from "@/lib/ncd/engine/evaluate";

/* ── The ordering ladder ─────────────────────────────────────────────────── */

/**
 * Ordinal points per strength tier. NOT probabilities and NOT tuned: the gaps
 * are wide and doubling so that a single `strong` finding cannot be
 * out-shouted by an accumulation of `weak` ones, which is the failure mode of
 * every additive score — four incidental findings should not outrank one
 * decisive sign.
 *
 * Fixed here rather than in the catalog on purpose. A per-catalog ladder is a
 * tunable weight file by another name, and that is exactly what ADR 0081
 * removed.
 */
const STRENGTH_POINTS: Record<DiscriminationStrength, number> = {
  weak: 1,
  moderate: 2,
  strong: 4,
  pathognomonic: 8,
};

/** A fired rule is a COMBINATION, so it outweighs any single finding. */
const POSTERIOR_POINTS: Record<Posterior, number> = {
  low: 2,
  moderate: 5,
  high: 10,
};

/**
 * What a recorded absence subtracts.
 *
 * `ImportantNegative` carries no strength tier by design (ADR 0083): the
 * qualification that matters lives in its mandatory `caveat` — "absent in mild
 * or early DKA" — and grading the absence as well would invite an author to put
 * the nuance in a tier where nobody reads it. One fixed, documented value.
 */
const ABSENCE_POINTS = 2;

/** Ascending, so urgency can be compared without a lookup chain. */
const URGENCY_RANK: Record<Urgency, number> = {
  routine: 0,
  same_day: 1,
  urgent: 2,
  immediate: 3,
};

/** The more urgent of two. */
const maxUrgency = (a: Urgency, b: Urgency): Urgency =>
  URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;

/* ── Results ─────────────────────────────────────────────────────────────── */

export interface DifferentialEvidence {
  /** The feature code — the traceability anchor the UI links back to. */
  feature: string;
  display: string;
  direction: "supports" | "refutes";
  strength: DiscriminationStrength;
  rationale: string;
  /**
   * True when this came from a RECORDED ABSENCE rather than a presence. The
   * surface says so out loud: "no Kussmaul respiration" argues differently from
   * a finding nobody looked for, and the two must never read the same.
   */
  viaAbsence?: boolean;
  lrPositive?: number;
  lrNegative?: number;
  citation: Citation;
}

/**
 * A confirmatory test, named twice on purpose.
 *
 * `code` is the traceability anchor and what the gaps list and the order form
 * read. `display` is what goes on screen — a clinician asked to send
 * "bohb, venous_ph" has to translate the catalog's identifiers in their head,
 * and an interface that makes someone do that at a bedside is one they stop
 * reading.
 */
export interface ConfirmatoryTest {
  code: string;
  display: string;
}

export interface FiredRule {
  id: string;
  display: string;
  posterior: Posterior;
  urgency: Urgency;
  confirmWith: ConfirmatoryTest[];
  mimicsToExclude: string[];
  notes?: string;
  /** The criterion result that fired it — predicates, observed values and all. */
  via: CriterionResult;
  citation: Citation;
}

export interface RankedCondition {
  code: string;
  display: string;
  /** The `Complication` that would ESTABLISH this, where the catalog models one. */
  complication?: string;
  /** 1-based position in the returned order. */
  rank: number;
  /**
   * The ordering score. Exported for tests and stable sorting only.
   * NEVER render this: it is not a probability and not a percentage.
   */
  score: number;
  /** The most pressing urgency any fired rule attached to this condition. */
  urgency: Urgency;
  /** The strongest posterior any fired rule reached. Absent if no rule fired. */
  posterior?: Posterior;
  supporting: DifferentialEvidence[];
  refuting: DifferentialEvidence[];
  firedRules: FiredRule[];
  /** Union of every fired rule's confirmatory set, de-duplicated, order-stable. */
  confirmWith: ConfirmatoryTest[];
  /** Union of every fired rule's mimics. */
  mimicsToExclude: string[];
}

export type Confidence = "low" | "moderate" | "high";

/** An unexamined finding whose answer would move the ranking most. */
export interface CheckNext {
  feature: string;
  display: string;
  elicitation?: string;
  /** Conditions this would bear on, most affected first. */
  bearsOn: string[];
  /** Why it is worth doing now, in the catalog's own words. */
  because: string;
}

export interface DifferentialResult {
  /** Ranked, most supported first. Conditions with no evidence are omitted. */
  conditions: RankedCondition[];
  confidence: Confidence;
  /** Shown verbatim. Explains the confidence rather than only asserting it. */
  confidenceReason: string;
  /** The one or two findings that would most change the picture. */
  checkNext: CheckNext[];
  /** Discriminating findings answered, over those applicable and performable. */
  answered: { recorded: number; applicable: number };
}

/* ── Age scoping ─────────────────────────────────────────────────────────── */

/**
 * Is this in scope for the patient's life stage?
 *
 * An UNKNOWN band leaves everything in scope. The alternative — guessing, or
 * filtering to adult by default — silently removes findings from an
 * examination, and a quietly narrowed examination is the more dangerous error.
 */
export function inAgeScope(bands: AgeBand[] | undefined, ctx: EvalContext): boolean {
  if (!bands || bands.length === 0) return true;
  if (!ctx.ageBand) return true;
  return bands.includes(ctx.ageBand);
}

/**
 * The reference band to read a number against — the age-specific one where the
 * catalog declares it and the patient's band is known, otherwise the unbanded
 * default. This is the whole of the age-banding resolution.
 */
export function resolveRefRange(
  f: Feature,
  ctx: EvalContext,
): { low?: number; high?: number; citation?: Citation } | undefined {
  if (ctx.ageBand && f.ageRefRanges?.length) {
    const banded = f.ageRefRanges.find((r) => r.band === ctx.ageBand);
    if (banded) return { low: banded.low, high: banded.high, citation: banded.citation };
  }
  return f.refRange ? { ...f.refRange, citation: f.citation } : undefined;
}

/* ── Accumulation ────────────────────────────────────────────────────────── */

interface Bucket {
  score: number;
  urgency: Urgency;
  posterior?: Posterior;
  supporting: DifferentialEvidence[];
  refuting: DifferentialEvidence[];
  firedRules: FiredRule[];
}

const emptyBucket = (): Bucket => ({
  score: 0,
  urgency: "routine",
  supporting: [],
  refuting: [],
  firedRules: [],
});

/**
 * Is this feature RECORDED as present / as absent?
 *
 * Both questions are asked against a recorded value only. `not_assessed` and
 * `unavailable` answer neither — which is the invariant the whole module rests
 * on, restated here because this is the one place a shortcut would be tempting.
 */
function recordedState(code: string, ctx: EvalContext): "present" | "absent" | undefined {
  const a = ctx.values[code];
  if (!a || a.state !== "recorded") return undefined;
  const v = a.value;
  if (typeof v === "boolean") return v ? "present" : "absent";
  if (typeof v === "number") return v > 0 ? "present" : "absent";
  if (Array.isArray(v)) return v.length > 0 ? "present" : "absent";
  if (typeof v === "string") {
    const neg = v === "" || v === "none" || v === "no" || v === "negative" || v === "absent";
    return neg ? "absent" : "present";
  }
  if (typeof v === "object" && v !== null && "option" in v) {
    const opt = (v as { option: string }).option;
    const neg = opt === "none" || opt === "no" || opt === "negative" || opt === "absent";
    return neg ? "absent" : "present";
  }
  return "present";
}

/** Deduplicate, preserving first-seen order — output must be stable. */
const uniq = (xs: string[]): string[] => [...new Set(xs)];

/** The same, keyed — two rules naming the same test must not list it twice. */
function uniqBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ── The ranking ─────────────────────────────────────────────────────────── */

export function rankDifferential(catalog: NcdCatalog, ctx: EvalContext): DifferentialResult {
  const conditions = catalog.conditions ?? [];
  const rules = catalog.rules ?? [];

  // A catalog that has not opted into this layer returns an empty, honest
  // result rather than an empty-looking ranking.
  if (conditions.length === 0) {
    return {
      conditions: [],
      confidence: "low",
      confidenceReason: "This catalog does not define a differential layer.",
      checkNext: [],
      answered: { recorded: 0, applicable: 0 },
    };
  }

  const byCode = new Map<string, DifferentialCondition>(conditions.map((c) => [c.code, c]));
  const buckets = new Map<string, Bucket>();
  const bucket = (code: string): Bucket => {
    let b = buckets.get(code);
    if (!b) buckets.set(code, (b = emptyBucket()));
    return b;
  };

  /* 1. Findings — what the clinician actually recorded, present or absent. */
  for (const f of catalog.features) {
    if (!inAgeScope(f.ageBands, ctx)) continue;
    const state = recordedState(f.code, ctx);
    if (!state) continue;

    if (state === "present") {
      for (const d of f.discriminates ?? []) {
        // An unknown condition code is a catalog bug the validator errors on.
        // Fail closed here too: never let a typo create a phantom row.
        if (!byCode.has(d.condition)) continue;
        const b = bucket(d.condition);
        const pts = STRENGTH_POINTS[d.strength];
        const ev = evidenceOf(f, d);
        if (d.direction === "supports") {
          b.score += pts;
          b.supporting.push(ev);
        } else {
          b.score -= pts;
          b.refuting.push(ev);
        }
      }
      if (f.urgency) {
        for (const d of f.discriminates ?? []) {
          if (d.direction === "supports" && byCode.has(d.condition)) {
            const b = bucket(d.condition);
            b.urgency = maxUrgency(b.urgency, f.urgency);
          }
        }
      }
      continue;
    }

    /* A RECORDED negative. This is the half a boolean engine cannot express. */
    const neg = f.importantNegative;
    if (!neg) continue;
    for (const code of neg.absenceRefutes) {
      if (!byCode.has(code)) continue;
      const b = bucket(code);
      b.score -= ABSENCE_POINTS;
      b.refuting.push({
        feature: f.code,
        display: f.display,
        direction: "refutes",
        strength: "moderate",
        rationale: neg.caveat,
        viaAbsence: true,
        citation: neg.citation,
      });
    }
  }

  /* 2. Rules — combinations, which is where the clinical value actually is. */
  for (const r of rules) {
    if (!inAgeScope(r.ageBands, ctx)) continue;
    if (!byCode.has(r.condition)) continue;
    const res = evaluateCriterion(r.when, ctx);
    if (res.state !== "met") continue;

    const b = bucket(r.condition);
    b.score += POSTERIOR_POINTS[r.posterior];
    b.urgency = maxUrgency(b.urgency, r.urgency);
    b.posterior = strongerPosterior(b.posterior, r.posterior);
    b.firedRules.push({
      id: r.id,
      display: r.display,
      posterior: r.posterior,
      urgency: r.urgency,
      // An unknown code falls back to itself rather than vanishing: a typo must
      // stay visible, not silently drop a confirmatory test off the list.
      confirmWith: r.confirmWith.map((code) => ({
        code,
        display: ctx.features.get(code)?.display ?? code,
      })),
      mimicsToExclude: r.mimicsToExclude,
      notes: r.notes,
      via: res,
      citation: r.citation,
    });

    /* A rule that fires argues AGAINST its stated alternatives. */
    for (const out of r.rulesOut ?? []) {
      if (!byCode.has(out)) continue;
      const ob = bucket(out);
      ob.score -= POSTERIOR_POINTS[r.posterior];
      ob.refuting.push({
        feature: r.id,
        display: r.display,
        direction: "refutes",
        strength: "strong",
        rationale: `${r.display} argues against this.`,
        citation: r.citation,
      });
    }
  }

  /* 3. Order. Deterministic to the last tie-break, so a rerun on the same
        values can never reshuffle the list under the clinician. */
  const ranked = [...buckets.entries()]
    .filter(([, b]) => b.supporting.length > 0 || b.firedRules.length > 0 || b.refuting.length > 0)
    .map(([code, b]) => ({ code, b, def: byCode.get(code)! }))
    .filter(({ def }) => inAgeScope(def.ageBands, ctx))
    .sort((x, y) => {
      if (y.b.score !== x.b.score) return y.b.score - x.b.score;
      const u = URGENCY_RANK[y.b.urgency] - URGENCY_RANK[x.b.urgency];
      if (u !== 0) return u;
      return x.code.localeCompare(y.code);
    })
    .map(({ code, b, def }, i): RankedCondition => {
      return {
        code,
        display: def.display,
        complication: def.complication,
        rank: i + 1,
        score: b.score,
        urgency: b.urgency,
        posterior: b.posterior,
        supporting: b.supporting,
        refuting: b.refuting,
        firedRules: b.firedRules,
        confirmWith: uniqBy(
          b.firedRules.flatMap((r) => r.confirmWith),
          (t) => t.code,
        ),
        mimicsToExclude: uniq(b.firedRules.flatMap((r) => r.mimicsToExclude)),
      };
    });

  const answered = countAnswered(catalog, ctx);
  const { confidence, confidenceReason } = confidenceOf(ranked, answered);

  return {
    conditions: ranked,
    confidence,
    confidenceReason,
    checkNext: checkNext(catalog, ctx, ranked),
    answered,
  };
}

function evidenceOf(f: Feature, d: Discrimination): DifferentialEvidence {
  return {
    feature: f.code,
    display: f.display,
    direction: d.direction,
    strength: d.strength,
    rationale: d.rationale,
    lrPositive: d.lrPositive,
    lrNegative: d.lrNegative,
    citation: d.citation,
  };
}

const strongerPosterior = (a: Posterior | undefined, b: Posterior): Posterior =>
  a && POSTERIOR_POINTS[a] >= POSTERIOR_POINTS[b] ? a : b;

/**
 * How much of the DISCRIMINATING examination has been done — the denominator
 * that stops a sparse clerking from reading as a confident one.
 *
 * Counts only findings that can actually move the ranking, are in scope for
 * this patient's age, and can be performed at this site. A site that cannot run
 * a test is not a clinician who failed to.
 */
function countAnswered(
  catalog: NcdCatalog,
  ctx: EvalContext,
): { recorded: number; applicable: number } {
  let recorded = 0;
  let applicable = 0;
  for (const f of catalog.features) {
    if (!f.discriminates?.length) continue;
    if (!inAgeScope(f.ageBands, ctx)) continue;
    if (!isPerformable(f, ctx.site)) continue;
    applicable++;
    if (recordedState(f.code, ctx)) recorded++;
  }
  return { recorded, applicable };
}

/**
 * Confidence in the RANKING, not in any one condition.
 *
 * A fired rule is a combination the catalog vouched for, so it lifts confidence
 * in a way an accumulation of single findings does not — but never on its own
 * to `high`, because a rule can fire on two findings and two findings are not
 * an examination.
 */
function confidenceOf(
  ranked: RankedCondition[],
  answered: { recorded: number; applicable: number },
): { confidence: Confidence; confidenceReason: string } {
  const highRule = ranked.some((c) => c.posterior === "high");
  const anyRule = ranked.some((c) => c.firedRules.length > 0);
  const n = answered.recorded;

  if (n < 3 && !anyRule) {
    return {
      confidence: "low",
      confidenceReason:
        `Only ${n} discriminating finding${n === 1 ? "" : "s"} recorded of ` +
        `${answered.applicable} available here. Too little to order a differential — ` +
        `record more of the examination before reading anything into this list.`,
    };
  }
  if (highRule && n >= 3) {
    return {
      confidence: "high",
      confidenceReason:
        `A named combination is satisfied and ${n} discriminating findings are recorded. ` +
        `Confirm with the tests listed against the leading consideration.`,
    };
  }
  if (anyRule || n >= 5) {
    return {
      confidence: "moderate",
      confidenceReason: anyRule
        ? `A named combination is satisfied, on ${n} recorded discriminating findings. ` +
          `More of the examination would firm up the order.`
        : `${n} discriminating findings recorded, but no named combination is yet satisfied.`,
    };
  }
  return {
    confidence: "low",
    confidenceReason:
      `${n} discriminating findings recorded of ${answered.applicable} available here, ` +
      `and no named combination satisfied. Treat the order below as provisional.`,
  };
}

/**
 * What to examine next.
 *
 * Ranks unexamined findings by how much they could move the CURRENT picture,
 * and deliberately prefers findings that bear on the top two conditions — the
 * question at the bedside is "which of these two is it?", and a finding that
 * only confirms the leader answers a question nobody is asking.
 */
function checkNext(catalog: NcdCatalog, ctx: EvalContext, ranked: RankedCondition[]): CheckNext[] {
  const contenders = new Set(ranked.slice(0, 2).map((c) => c.code));
  const scored: { f: Feature; movement: number; bearsOn: string[]; because: string }[] = [];

  for (const f of catalog.features) {
    if (!f.discriminates?.length) continue;
    if (!inAgeScope(f.ageBands, ctx)) continue;
    if (!isPerformable(f, ctx.site)) continue;
    if (recordedState(f.code, ctx)) continue;

    let movement = 0;
    const bearsOn: string[] = [];
    let best: Discrimination | undefined;
    for (const d of f.discriminates) {
      const pts = STRENGTH_POINTS[d.strength];
      // Worth double where it bears on a live contender: separating the top two
      // is the decision actually in front of the clinician.
      const weighted = contenders.has(d.condition) ? pts * 2 : pts;
      movement += weighted;
      bearsOn.push(d.condition);
      if (!best || STRENGTH_POINTS[d.strength] > STRENGTH_POINTS[best.strength]) best = d;
    }
    if (movement === 0 || !best) continue;
    scored.push({ f, movement, bearsOn: uniq(bearsOn), because: best.rationale });
  }

  return scored
    .sort((a, b) => b.movement - a.movement || a.f.code.localeCompare(b.f.code))
    .slice(0, 2)
    .map(({ f, bearsOn, because }) => ({
      feature: f.code,
      display: f.display,
      elicitation: f.elicitation,
      bearsOn,
      because,
    }));
}

/**
 * The named things to exclude before acting on the leading consideration.
 *
 * Surfaced separately because a mimic list buried inside a ranked row is read
 * last, and it is the part that stops someone treating salicylate toxicity as
 * DKA.
 */
export function mimicsFor(result: DifferentialResult): string[] {
  return uniq(result.conditions.flatMap((c) => c.mimicsToExclude));
}

/** Every rule that fired, most urgent first — the red-flag pin. */
export function urgentRules(result: DifferentialResult): FiredRule[] {
  return result.conditions
    .flatMap((c) => c.firedRules)
    .filter((r) => URGENCY_RANK[r.urgency] >= URGENCY_RANK.urgent)
    .sort((a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] || a.id.localeCompare(b.id));
}
