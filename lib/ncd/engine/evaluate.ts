/**
 * Criterion evaluation — the primitive every other engine function is built on.
 * Pure, client-safe, no clinical content.
 *
 * ── Why a criterion is not a boolean ─────────────────────────────────────────
 *
 * The single most important decision in this module: evaluating a clinical rule
 * yields FOUR states, not two.
 *
 *   met           the recorded data satisfies it
 *   not_met       the recorded data CONTRADICTS it — a real negative
 *   insufficient  the deciding data has not been captured yet
 *   unavailable   the deciding data cannot be obtained at this site at all
 *
 * A two-state evaluator has to collapse "we looked and it was normal" together
 * with "nobody looked", and that collapse is exactly how a screening tool tells
 * a clinician a patient has no retinopathy when no one examined their eyes.
 * Keeping `insufficient` separate is what makes the gaps list possible; keeping
 * `unavailable` separate is what stops that list nagging about a test the site
 * cannot run, which is how gaps lists become noise people learn to ignore.
 *
 * The two combination rules below encode the difference honestly, and they are
 * NOT symmetric — see the comments on each.
 */
import type {
  Assessed,
  CapabilityCode,
  Citation,
  Criterion,
  Feature,
  Predicate,
  SiteProfile,
} from "@/lib/ncd/catalog/schema";

import { isPerformable } from "@/lib/ncd/catalog/schema";

export type EvalState = "met" | "not_met" | "insufficient" | "unavailable";

/** A captured value for a feature. Anything not present is `not_assessed`. */
export type CaptureValue = number | string | string[] | boolean;
export type CaptureMap = Record<string, Assessed<CaptureValue> | undefined>;

export interface PredicateResult {
  predicate: Predicate;
  state: EvalState;
  /** The value that decided it — the evidence trail shown to the clinician. */
  observed?: CaptureValue;
  /** Set when state is `unavailable`. */
  capability?: CapabilityCode;
}

export interface CriterionResult {
  id: string;
  label: string;
  state: EvalState;
  predicates: PredicateResult[];
  /** Feature codes that would settle an `insufficient` verdict. Drives gaps(). */
  missing: string[];
  /** Feature codes that cannot be obtained here, with the capability they need. */
  blocked: { feature: string; capability: CapabilityCode }[];
  /** Guideline requires a second sample before this counts. */
  requiresConfirmation: boolean;
  citation: Citation;
}

export interface EvalContext {
  values: CaptureMap;
  features: Map<string, Feature>;
  site: SiteProfile;
}

/* ── one predicate ───────────────────────────────────────────────────────── */

const asNumber = (v: CaptureValue): number | undefined => (typeof v === "number" ? v : undefined);

/** Truthiness for `present`/`absent`: a recorded value that means "there". */
function isPositive(v: CaptureValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v.trim() !== "" && v !== "none" && v !== "negative";
}

export function evaluatePredicate(p: Predicate, ctx: EvalContext): PredicateResult {
  const feature = ctx.features.get(p.feature);
  const assessed = ctx.values[p.feature];

  // An unknown feature is a catalog bug, not a clinical finding. Fail closed:
  // never let a typo read as a satisfied criterion.
  if (!feature) return { predicate: p, state: "insufficient" };

  if (!assessed || assessed.state !== "recorded") {
    // Distinguish "not done yet" from "cannot be done here". An explicit
    // `unavailable` capture wins; otherwise infer from the site profile.
    if (assessed?.state === "unavailable") {
      return { predicate: p, state: "unavailable", capability: assessed.capability };
    }
    if (feature.requires && !isPerformable(feature, ctx.site)) {
      return { predicate: p, state: "unavailable", capability: feature.requires };
    }
    return { predicate: p, state: "insufficient" };
  }

  const v = assessed.value;
  const hit = (ok: boolean): PredicateResult => ({
    predicate: p,
    state: ok ? "met" : "not_met",
    observed: v,
  });

  switch (p.op) {
    case "present":
      return hit(isPositive(v));
    case "absent":
      return hit(!isPositive(v));
    case "==":
      return hit(Array.isArray(v) ? v.includes(String(p.value)) : v === p.value);
    case "!=":
      return hit(Array.isArray(v) ? !v.includes(String(p.value)) : v !== p.value);
    case "in": {
      const set = Array.isArray(p.value) ? p.value.map(String) : [];
      return hit(Array.isArray(v) ? v.some((x) => set.includes(x)) : set.includes(String(v)));
    }
    case ">=":
    case ">":
    case "<=":
    case "<": {
      const n = asNumber(v);
      const t = typeof p.value === "number" ? p.value : undefined;
      // A numeric comparison against a non-numeric capture is not a negative —
      // it is missing data, and must not read as "criterion not met".
      if (n === undefined || t === undefined) return { predicate: p, state: "insufficient" };
      const ok = p.op === ">=" ? n >= t : p.op === ">" ? n > t : p.op === "<=" ? n <= t : n < t;
      return hit(ok);
    }
    default:
      return { predicate: p, state: "insufficient" };
  }
}

/* ── combining predicates ────────────────────────────────────────────────── */

/**
 * AND. `not_met` dominates everything: one contradicted requirement makes the
 * criterion definitively false no matter what else is missing.
 *
 * Then `unavailable` outranks `insufficient` — deliberately. If one required
 * test is simply undone and another cannot be done here at all, the criterion
 * can NEVER be satisfied at this site, so reporting it as merely "insufficient"
 * would put it on a gaps list the clinician can never clear.
 */
function combineAll(rs: PredicateResult[]): EvalState {
  if (!rs.length) return "met";
  if (rs.some((r) => r.state === "not_met")) return "not_met";
  if (rs.every((r) => r.state === "met")) return "met";
  if (rs.some((r) => r.state === "unavailable")) return "unavailable";
  return "insufficient";
}

/**
 * OR. `met` dominates: one satisfied alternative is enough.
 *
 * Then `insufficient` outranks `unavailable` — the OPPOSITE of AND, and for the
 * same underlying reason. Diagnostic criteria are characteristically
 * alternatives (fasting glucose OR OGTT OR HbA1c), so if one alternative is
 * merely undone while another is unobtainable here, the criterion is still
 * reachable: do the test you can do. Calling it `unavailable` would wrongly
 * tell the clinician the question is closed.
 */
function combineAny(rs: PredicateResult[]): EvalState {
  if (!rs.length) return "met";
  if (rs.some((r) => r.state === "met")) return "met";
  if (rs.some((r) => r.state === "insufficient")) return "insufficient";
  if (rs.some((r) => r.state === "unavailable")) return "unavailable";
  return "not_met";
}

/**
 * n-of-m. `met` once n alternatives are satisfied. `not_met` only when even the
 * unresolved predicates could not carry it to n — so a partially-captured
 * staging rule reports as unresolved rather than as a negative, which is the
 * same honesty rule the other two combinators follow.
 */
function combineAtLeast(rs: PredicateResult[], n: number): EvalState {
  const met = rs.filter((r) => r.state === "met").length;
  if (met >= n) return "met";
  const insufficient = rs.filter((r) => r.state === "insufficient").length;
  const unavail = rs.filter((r) => r.state === "unavailable").length;
  if (met + insufficient + unavail < n) return "not_met";
  return insufficient > 0 ? "insufficient" : "unavailable";
}

/** AND of two branch states, using the same precedence as `combineAll`. */
function conjoin(a: EvalState, b: EvalState): EvalState {
  if (a === "not_met" || b === "not_met") return "not_met";
  if (a === "met" && b === "met") return "met";
  if (a === "unavailable" || b === "unavailable") return "unavailable";
  return "insufficient";
}

/* ── one criterion ───────────────────────────────────────────────────────── */

export function evaluateCriterion(c: Criterion, ctx: EvalContext): CriterionResult {
  const allRs = (c.all ?? []).map((p) => evaluatePredicate(p, ctx));
  const anyRs = (c.any ?? []).map((p) => evaluatePredicate(p, ctx));
  const atLeastRs = (c.atLeast?.of ?? []).map((p) => evaluatePredicate(p, ctx));

  // Each branch is evaluated independently, then conjoined — a criterion that
  // gives more than one branch means ALL of them must hold.
  const branches: EvalState[] = [];
  if (c.all?.length) branches.push(combineAll(allRs));
  if (c.any?.length) branches.push(combineAny(anyRs));
  if (c.atLeast?.of.length) branches.push(combineAtLeast(atLeastRs, c.atLeast.n));
  // A criterion with no predicates cannot assert anything about a patient.
  const state: EvalState = branches.length ? branches.reduce(conjoin) : "insufficient";

  const predicates = [...allRs, ...anyRs, ...atLeastRs];
  return {
    id: c.id,
    label: c.label,
    state,
    predicates,
    missing: [
      ...new Set(
        predicates.filter((r) => r.state === "insufficient").map((r) => r.predicate.feature),
      ),
    ],
    blocked: predicates
      .filter((r) => r.state === "unavailable" && r.capability)
      .map((r) => ({ feature: r.predicate.feature, capability: r.capability! }))
      .filter((b, i, xs) => xs.findIndex((y) => y.feature === b.feature) === i),
    requiresConfirmation: c.requiresConfirmation ?? false,
    citation: c.citation,
  };
}

/** Evaluate a list of alternatives (a `CriteriaSet.anyOf`), best state first. */
export function evaluateAny(cs: Criterion[], ctx: EvalContext): CriterionResult[] {
  const rank: Record<EvalState, number> = {
    met: 0,
    insufficient: 1,
    unavailable: 2,
    not_met: 3,
  };
  return cs
    .map((c) => evaluateCriterion(c, ctx))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank[a.r.state] - rank[b.r.state] || a.i - b.i)
    .map((x) => x.r);
}

/** The overall state of a set of alternatives — same precedence as `any`. */
export function rollUpAny(rs: CriterionResult[]): EvalState {
  if (!rs.length) return "insufficient";
  if (rs.some((r) => r.state === "met")) return "met";
  if (rs.some((r) => r.state === "insufficient")) return "insufficient";
  if (rs.some((r) => r.state === "unavailable")) return "unavailable";
  return "not_met";
}

/** Build an evaluation context from a catalog's features. */
export function contextOf(features: Feature[], values: CaptureMap, site: SiteProfile): EvalContext {
  return { values, features: new Map(features.map((f) => [f.code, f])), site };
}
