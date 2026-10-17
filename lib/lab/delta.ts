/**
 * Delta checks (Lab Phase 5 §6.4, DL-1..DL-13; CLSI EP33 2nd ed.; ADR 0333). Pure. A rule is signed data: type,
 * limit, look-back window and basis, with the laboratory lead's signature and the CSO's countersignature. No
 * numeric limit, window or threshold lives in this file; the RCV calculator proposes, the lead signs.
 */
import { z } from "zod";

/* ─── DL-1: the rule ────────────────────────────────────────────────── */
export const DELTA_TYPES = ["absolute", "percent", "rate_absolute", "rate_percent", "rcv"] as const;
export type DeltaType = (typeof DELTA_TYPES)[number];
const positive = z.number().positive();
const source = z.string().trim().min(3).max(300);

export const DeltaRulePayload = z
  .object({
    concept: z.string().regex(/^obs\.[a-z0-9_]+$/),
    type: z.enum(DELTA_TYPES),
    /** One limit for both directions, or separate rise and fall limits (in the unit, %, or per day). */
    limit: z.union([
      z.object({ both: positive }),
      z.object({ rise: positive.nullable(), fall: positive.nullable() }),
    ]),
    windowHours: z
      .number()
      .int()
      .positive()
      .max(24 * 3650),
    basis: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("rcv"),
        cvaPercent: positive,
        cvaSource: source,
        cviPercent: positive,
        cviSource: source,
        z: z.enum(["1.65", "1.96", "2.33", "2.58"]),
        logNormal: z.boolean(),
      }),
      z.object({
        kind: z.literal("local_patient_percentile"),
        percentile: positive.max(100),
        dataPeriod: source,
      }),
      z.object({
        kind: z.literal("clinical"),
        approver: z.string().trim().min(3).max(120),
        rationale: source,
      }),
    ]),
    applicability: z.object({
      ageFromYears: z.number().int().min(0).nullable(),
      ageToYears: z.number().int().min(0).nullable(),
      specimen: z.string().nullable(),
    }),
    /** DL-2: compare across different method codes only when the rule says so. */
    acrossMethods: z.boolean(),
    meaning: z.string().trim().min(5).max(200),
    source,
  })
  .refine((r) => r.type !== "rcv" || r.basis.kind === "rcv", {
    message: "An RCV rule needs an RCV basis (CVA, CVI and Z with their sources).",
  });
export type DeltaRule = z.infer<typeof DeltaRulePayload>;

/** DL-10: a panel rule — send to a person when at least k of the listed components fail their delta. */
export const PanelRulePayload = z
  .object({
    testCode: z.string().regex(/^test\.[a-z0-9_]+$/),
    components: z.array(z.string().regex(/^obs\.[a-z0-9_]+$/)).min(2),
    k: z.number().int().min(1),
    meaning: z.string().trim().min(5).max(200),
    source,
  })
  .refine((p) => p.k <= p.components.length, {
    message: "k cannot exceed the number of components.",
  });
export type PanelRule = z.infer<typeof PanelRulePayload>;

/** DL-11: a pattern rule, described in words, with the lab's own thresholds (all conditions must hold). */
export const PatternRulePayload = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(400),
  conditions: z
    .array(
      z.object({
        concept: z.string().regex(/^obs\.[a-z0-9_]+$/),
        op: z.enum(["above", "below", "rose_by", "fell_by"]),
        value: positive,
      }),
    )
    .min(2),
  meaning: z.string().trim().min(5).max(200),
  source,
});
export type PatternRule = z.infer<typeof PatternRulePayload>;

/* ─── DL-3: the reference change value (Fraser) ────────────────────── */
/** Symmetric: RCV = √2 × Z × √(CVA² + CVI²), in per cent. */
export function rcv(cvaPercent: number, cviPercent: number, z: number): number {
  return Math.SQRT2 * z * Math.sqrt(cvaPercent ** 2 + cviPercent ** 2);
}
/** Log-normal (asymmetric) RCV for skewed analytes: { up, down } in per cent (down is negative). */
export function rcvLogNormal(cvaPercent: number, cviPercent: number, z: number) {
  const sigma = Math.sqrt(
    Math.log((cvaPercent / 100) ** 2 + 1) + Math.log((cviPercent / 100) ** 2 + 1),
  );
  return {
    up: (Math.exp(z * Math.SQRT2 * sigma) - 1) * 100,
    down: (Math.exp(-z * Math.SQRT2 * sigma) - 1) * 100,
  };
}

/* ─── DL-2: the previous result ────────────────────────────────────── */
export interface PriorResult {
  reportId: string;
  value: number;
  /** Already in the current result's unit, converted only through the unit registry by the caller. */
  at: Date;
  methodCode: string | null;
  /** Amended away (a later version replaced this value). */
  amendedAway: boolean;
}
export type Previous =
  | { kind: "none" }
  | { kind: "different_method"; prior: PriorResult }
  | { kind: "compare"; prior: PriorResult };
export function previousResult(
  history: readonly PriorResult[],
  now: { at: Date; methodCode: string | null },
  rule: Pick<DeltaRule, "windowHours" | "acrossMethods">,
): Previous {
  const from = now.at.getTime() - rule.windowHours * 3_600_000;
  const prior = history
    .filter((h) => !h.amendedAway && h.at.getTime() < now.at.getTime() && h.at.getTime() >= from)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (!prior) return { kind: "none" };
  if (!rule.acrossMethods && prior.methodCode !== now.methodCode)
    return { kind: "different_method", prior };
  return { kind: "compare", prior };
}

/* ─── DL-3, DL-4: evaluation ───────────────────────────────────────── */
export interface Evaluation {
  fired: boolean;
  changeAbs: number;
  changePct: number | null;
  intervalHours: number;
  direction: "rise" | "fall" | "none";
}
export function evaluate(
  rule: DeltaRule,
  previous: number,
  current: number,
  intervalHours: number,
): Evaluation {
  const changeAbs = current - previous;
  const changePct = previous === 0 ? null : (changeAbs / Math.abs(previous)) * 100;
  const direction = changeAbs > 0 ? "rise" : changeAbs < 0 ? "fall" : "none";
  const days = intervalHours / 24;
  const measure =
    rule.type === "absolute"
      ? Math.abs(changeAbs)
      : rule.type === "percent" || rule.type === "rcv"
        ? changePct === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(changePct)
        : rule.type === "rate_absolute"
          ? days > 0
            ? Math.abs(changeAbs) / days
            : Number.POSITIVE_INFINITY
          : changePct === null || days <= 0
            ? Number.POSITIVE_INFINITY
            : Math.abs(changePct) / days;
  const limitFor = (d: "rise" | "fall"): number | null => {
    if (rule.type === "rcv" && rule.basis.kind === "rcv") {
      const zv = Number(rule.basis.z);
      if (rule.basis.logNormal) {
        const l = rcvLogNormal(rule.basis.cvaPercent, rule.basis.cviPercent, zv);
        return d === "rise" ? l.up : -l.down;
      }
      return rcv(rule.basis.cvaPercent, rule.basis.cviPercent, zv);
    }
    return "both" in rule.limit
      ? rule.limit.both
      : d === "rise"
        ? rule.limit.rise
        : rule.limit.fall;
  };
  const limit = direction === "none" ? null : limitFor(direction);
  return {
    fired: limit !== null && measure > limit,
    changeAbs,
    changePct,
    intervalHours,
    direction,
  };
}

/** Applicability: age band and specimen (DL-1). */
export function applies(
  rule: Pick<DeltaRule, "applicability">,
  p: { ageYears: number; specimen: string | null },
) {
  const a = rule.applicability;
  return (
    (a.ageFromYears === null || p.ageYears >= a.ageFromYears) &&
    (a.ageToYears === null || p.ageYears <= a.ageToYears) &&
    (a.specimen === null || a.specimen === p.specimen)
  );
}

/** DL-10: k of N components failed their delta. */
export const panelFires = (rule: PanelRule, failed: readonly string[]) =>
  rule.components.filter((c) => failed.includes(c)).length >= rule.k;

/** DL-11: every condition holds on the current values (and, for rose_by/fell_by, the change). */
export function patternFires(
  rule: PatternRule,
  values: Record<string, { now: number; previous: number | null }>,
): boolean {
  return rule.conditions.every((c) => {
    const v = values[c.concept];
    if (!v) return false;
    if (c.op === "above") return v.now > c.value;
    if (c.op === "below") return v.now < c.value;
    if (v.previous === null) return false;
    return c.op === "rose_by" ? v.now - v.previous >= c.value : v.previous - v.now >= c.value;
  });
}

/* ─── DL-6: outcomes; release needs one per fired rule ─────────────── */
export const DELTA_OUTCOMES = [
  "physiological_or_treatment",
  "transfusion_or_dialysis",
  "confirmed_same_patient",
  "contamination_suspected",
  "previous_specimen_suspect",
  "recollect",
  "mislabel_confirmed",
] as const;
export type DeltaOutcome = (typeof DELTA_OUTCOMES)[number];
/** The flags still waiting for a decision; release stays disabled while any remain (soft stop, DL-6). */
export const undecided = (flagIds: readonly string[], decided: readonly string[]) =>
  flagIds.filter((f) => !decided.includes(f));

/* ─── DL-8: the trial on past released pairs (read-only) ───────────── */
export interface Pair {
  previous: number;
  current: number;
  intervalHours: number;
  /** The later specimen matches a known mislabel nonconformity. */
  knownMislabel: boolean;
}
export function trialRule(rule: DeltaRule, pairs: readonly Pair[]) {
  let flags = 0;
  let mislabelsFlagged = 0;
  const mislabels = pairs.filter((p) => p.knownMislabel).length;
  for (const p of pairs) {
    if (p.intervalHours > rule.windowHours) continue;
    if (evaluate(rule, p.previous, p.current, p.intervalHours).fired) {
      flags++;
      if (p.knownMislabel) mislabelsFlagged++;
    }
  }
  return { pairs: pairs.length, flags, mislabels, mislabelsFlagged };
}

/* ─── DL-9: the monthly review ──────────────────────────────────────── */
/** Operational: above this flag rate a rule shows "Flags often · review". */
export const FLAGS_OFTEN_RATE = 0.05;
export function monthlyReview(
  evaluated: number,
  outcomes: readonly DeltaOutcome[],
  oftenRate = FLAGS_OFTEN_RATE,
) {
  const share = Object.fromEntries(
    DELTA_OUTCOMES.map((o) => [
      o,
      outcomes.length ? outcomes.filter((x) => x === o).length / outcomes.length : null,
    ]),
  ) as Record<DeltaOutcome, number | null>;
  const rate = evaluated ? outcomes.length / evaluated : null;
  const sampleErrors = outcomes.filter((o) =>
    [
      "mislabel_confirmed",
      "contamination_suspected",
      "previous_specimen_suspect",
      "recollect",
    ].includes(o),
  ).length;
  return {
    rate,
    share,
    /** The positive predictive value for sample errors. */
    ppv: outcomes.length ? sampleErrors / outcomes.length : null,
    flagsOften: rate !== null && rate > oftenRate,
  };
}
