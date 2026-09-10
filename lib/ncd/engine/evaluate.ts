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
  AgeBand,
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

/**
 * A selected option that carries a free-text detail beside it — a current dose,
 * for instance. The detail is DOCUMENTATION and is never evaluated: predicates
 * read `option` only, so no clinical rule can turn on a dose string.
 */
export interface CaptureEntry {
  option: string;
  detail?: string;
}

/**
 * A duration recorded in whichever unit the clinician actually knows it in.
 *
 * "Six weeks since diagnosis" and "eleven years since diagnosis" are both
 * normal answers, and forcing either into a single unit invites a fraction or a
 * silent rounding. The unit travels WITH the value so a comparison can normalise
 * both sides — without that, a threshold of 10 years tested against 120 months
 * compares 120 >= 10 and passes, which is the same class of error as the
 * mmol/L-versus-mg/dL trap the validator already guards.
 */
export type DurationUnit = "minutes" | "hours" | "days" | "weeks" | "months" | "years";
export interface CaptureDuration {
  value: number;
  unit: DurationUnit;
}

/**
 * Days per unit, ascending. Month and year are the conventional averages, not
 * exact. Hours earn a place because acute symptoms are measured in them: a
 * hyperglycaemic crisis turns on whether the vomiting started this morning or
 * three days ago, and forcing that into a fraction of a day is how a clinician
 * ends up typing 0.25. Minutes for the same reason one step down: chest pain
 * lasting under ten minutes and chest pain lasting over twenty are different
 * problems, and neither is a sensible fraction of an hour.
 */
export const DURATION_DAYS: Record<DurationUnit, number> = {
  minutes: 1 / 1440,
  hours: 1 / 24,
  days: 1,
  weeks: 7,
  months: 30.4375,
  years: 365.25,
};

export const isDuration = (v: unknown): v is CaptureDuration =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as CaptureDuration).value === "number" &&
  (v as CaptureDuration).unit in DURATION_DAYS;

export const durationInDays = (d: CaptureDuration): number => d.value * DURATION_DAYS[d.unit];

/** The units a duration control offers, shortest first. */
export const DURATION_UNITS = Object.keys(DURATION_DAYS) as DurationUnit[];

/**
 * A vital measured more than once — the reading and the moment it was taken.
 *
 * Vitals are not a number, they are a number AND a time, and the second one is
 * what makes a trend. A blood pressure of 160 an hour ago and 132 now is a
 * different patient from one who has sat at 160 all morning, and a single field
 * cannot tell them apart.
 *
 * Ordered oldest-first. Every rule reads the LATEST entry — the current state of
 * the patient is what a criterion is about — but the whole series is kept, so
 * the surface can draw it and a later reader can see the direction of travel.
 */
export interface CaptureReading {
  value: number;
  /** ISO instant. */
  at: string;
}
export type CaptureSeries = CaptureReading[];

export const isReading = (v: unknown): v is CaptureReading =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as CaptureReading).value === "number" &&
  typeof (v as CaptureReading).at === "string";

export const isSeries = (v: unknown): v is CaptureSeries =>
  Array.isArray(v) && v.length > 0 && v.every(isReading);

/** The reading a rule reads: the most recent one. */
export const latestReading = (s: CaptureSeries): CaptureReading | undefined =>
  s.reduce<CaptureReading | undefined>((a, r) => (!a || r.at > a.at ? r : a), undefined);

/** A captured value for a feature. Anything not present is `not_assessed`. */
export type CaptureValue =
  | number
  | string
  | string[]
  | boolean
  /** A single-select whose chosen option carries an optional note. */
  | CaptureEntry
  | CaptureEntry[]
  | CaptureDuration
  /** A vital measured more than once. Rules read the latest entry. */
  | CaptureSeries;

export const isEntry = (v: unknown): v is CaptureEntry =>
  typeof v === "object" && v !== null && typeof (v as CaptureEntry).option === "string";

const isEntryList = (v: CaptureValue): v is CaptureEntry[] =>
  Array.isArray(v) && v.length > 0 && v.every(isEntry);

/**
 * The selected values of a capture, whatever form it takes: a plain string
 * array, an entry list carrying details, or a single entry from a select whose
 * chosen option needs one. Details never appear here — only options.
 */
function selectedOptions(v: CaptureValue): string[] | undefined {
  if (isEntry(v)) return [v.option];
  if (!Array.isArray(v)) return undefined;
  // A series is numbers over time, not a selection — comparing it as options
  // would make "160" an option code.
  if (isSeries(v)) return undefined;
  return isEntryList(v) ? v.map((e) => e.option) : (v as string[]).map(String);
}
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
  /**
   * The patient's life stage, where it is known (ADR 0083).
   *
   * OPTIONAL, and the fallbacks are deliberate: an unknown band resolves
   * age-banded reference ranges to the unbanded `refRange`, and leaves every
   * age-scoped feature and rule IN scope rather than filtering it out. Guessing
   * a band would silently narrow what the clinician is shown, and a narrower
   * examination is the more dangerous error.
   */
  ageBand?: AgeBand;
}

/* ── one predicate ───────────────────────────────────────────────────────── */

/** The number a rule compares against — for a series, the most recent reading. */
const asNumber = (v: CaptureValue): number | undefined => {
  if (typeof v === "number") return v;
  if (isSeries(v)) return latestReading(v)?.value;
  return undefined;
};

/** Truthiness for `present`/`absent`: a recorded value that means "there". */
function isPositive(v: CaptureValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (isSeries(v)) return (latestReading(v)?.value ?? 0) > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (isDuration(v)) return v.value > 0;
  if (isEntry(v)) return isPositive(v.option);
  return v.trim() !== "" && v !== "none" && v !== "negative";
}

export function evaluatePredicate(p: Predicate, ctx: EvalContext): PredicateResult {
  const feature = ctx.features.get(p.feature);
  const assessed = ctx.values[p.feature];

  // An unknown feature is a catalog bug, not a clinical finding. Fail closed:
  // never let a typo read as a satisfied criterion.
  if (!feature) return { predicate: p, state: "insufficient" };

  // Off-protocol capture is the clinician's own words, not a modelled finding.
  // The validator rejects any criterion naming one, so reaching here is already a
  // bug — fail closed rather than let free text decide a clinical verdict. Never
  // `not_met`: that would make `absent` read as a recorded negative, which is the
  // absence-of-evidence collapse this whole module exists to prevent.
  if (feature.offProtocol) return { predicate: p, state: "insufficient" };

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

  // An array capture is compared on its SELECTED OPTIONS, whether it is a plain
  // multi-select or an entry list carrying details. The detail never features.
  const picked = selectedOptions(v);

  switch (p.op) {
    case "present":
    case "absent": {
      // An empty capture carries NO information. Nothing ticked is not the same
      // as "none of these apply", and an empty string is not a recorded answer —
      // yet both would satisfy `absent` and manufacture a negative out of
      // silence, which is the one collapse this evaluator exists to refuse. The
      // capture surface no longer writes either, so reaching here means legacy
      // or imported data: fail closed.
      const empty =
        (Array.isArray(v) && v.length === 0) || (typeof v === "string" && v.trim() === "");
      if (empty) return { predicate: p, state: "insufficient" };
      return hit(p.op === "present" ? isPositive(v) : !isPositive(v));
    }
    case "==":
      return hit(picked ? picked.includes(String(p.value)) : v === p.value);
    case "!=":
      return hit(picked ? !picked.includes(String(p.value)) : v !== p.value);
    case "in": {
      const set = Array.isArray(p.value) ? p.value.map(String) : [];
      return hit(picked ? picked.some((x) => set.includes(x)) : set.includes(String(v)));
    }
    case ">=":
    case ">":
    case "<=":
    case "<": {
      let n = asNumber(v);
      let t = typeof p.value === "number" ? p.value : undefined;
      // Durations normalise to days on BOTH sides before comparing, so 120
      // months correctly exceeds a 10-year threshold instead of losing to it.
      if (isDuration(v)) {
        const unit = p.unit as DurationUnit | undefined;
        if (!unit || !(unit in DURATION_DAYS) || t === undefined) {
          return { predicate: p, state: "insufficient" };
        }
        n = durationInDays(v);
        t = t * DURATION_DAYS[unit];
      }
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

/**
 * Arithmetic, not clinical content — which is the whole reason it is allowed to
 * live in the engine. BMI is weight over height squared everywhere; what counts
 * as obese is a threshold, and thresholds stay in the catalog where they carry a
 * citation.
 */
const FORMULAS: Record<string, (args: number[]) => number | undefined> = {
  /** kg and cm in, kg/m² out, rounded to a tenth — the precision it is reported at. */
  bmi: ([weight, height]) => {
    if (!weight || !height) return undefined;
    const m = height / 100;
    return Math.round((weight / (m * m)) * 10) / 10;
  },
};

/**
 * Build an evaluation context, computing whatever can be computed.
 *
 * A computed value is a REAL capture in the context: bands read it, criteria may
 * reference it, and it counts as answered once its inputs are. It is derived
 * fresh every time rather than stored, so it can never disagree with the numbers
 * it comes from — the failure mode of a stored BMI is that somebody corrects the
 * weight and the BMI quietly keeps the old answer.
 *
 * An input that is missing, unavailable or non-numeric yields NOTHING rather
 * than a zero: a BMI of 0 is not a thin patient, it is an unanswered question.
 */
export function contextOf(features: Feature[], values: CaptureMap, site: SiteProfile): EvalContext {
  const index = new Map(features.map((f) => [f.code, f]));
  let derived: CaptureMap | undefined;

  for (const f of features) {
    if (!f.computed) continue;
    const fn = FORMULAS[f.computed.formula];
    if (!fn) continue;
    const args: number[] = [];
    for (const code of f.computed.from) {
      const v = values[code];
      if (v?.state !== "recorded") break;
      const n =
        typeof v.value === "number"
          ? v.value
          : isSeries(v.value)
            ? latestReading(v.value)?.value
            : undefined;
      if (n === undefined) break;
      args.push(n);
    }
    if (args.length !== f.computed.from.length) continue;
    const out = fn(args);
    if (out === undefined || !Number.isFinite(out)) continue;
    derived ??= { ...values };
    derived[f.code] = { state: "recorded", value: out };
  }

  return { values: derived ?? values, features: index, site };
}
