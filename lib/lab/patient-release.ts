/**
 * Patient release (Lab Phase 5 §6.1, PR-1..PR-17; ADR 0328). Pure: every decision is over a snapshot the caller
 * reads. `visibleToPatient` is the single gate every patient surface, the results-ready SMS and any future mobile
 * read uses (E-LAB5-01). The never-shown floor is code here and schema in 0154 (`private.never_shown`); the signed
 * release table, minors rule and floor additions are data. No clinical number lives in this file.
 */
import { z } from "zod";

/* ─── PR-3: the never-shown floor (configuration adds, never removes) ── */
export const NEVER_SHOWN_CLASSES = [
  "hiv",
  "tb",
  "mental_health",
  "sexual_reproductive_health",
] as const;
export const NEVER_SHOWN_TEST_CODES = ["test.pregnancy_urine"] as const;
export const NEVER_SHOWN_GROUPS = ["tissue", "cytology"] as const;

export interface TestFacts {
  code: string;
  restrictedClass: string | null;
  patientGroup: string | null;
}
/** PR-3: true when the test, its name and its pending state must never reach a patient surface or an SMS. */
export function neverShown(t: TestFacts, additions: readonly string[] = []): boolean {
  return (
    (t.restrictedClass !== null &&
      (NEVER_SHOWN_CLASSES as readonly string[]).includes(t.restrictedClass)) ||
    (NEVER_SHOWN_TEST_CODES as readonly string[]).includes(t.code) ||
    (t.patientGroup !== null &&
      (NEVER_SHOWN_GROUPS as readonly string[]).includes(t.patientGroup)) ||
    additions.includes(t.code)
  );
}

/* ─── The signed release table (5.5), the minors rule (PR-11), floor additions ─ */
export const RELEASE_GROUPS = ["routine", "critical", "referred", "bedside", "corrected"] as const;
export type ReleaseGroup = (typeof RELEASE_GROUPS)[number];
const source = z.object({
  doc: z.string().trim().min(2).max(200),
  date: z.string().min(4).max(40),
});
const groupRule = z.object({
  inApp: z.enum(["after_review", "after_told", "never"]),
  sms: z.boolean(),
});
export const PatientReleasePayload = z.object({
  groups: z.object({
    routine: groupRule,
    critical: groupRule,
    referred: groupRule,
    bedside: groupRule,
    corrected: groupRule,
  }),
  /** PR-7: the longest a hold may run, in days (signed). */
  holdMaxDays: z.number().int().min(1).max(366),
  /** PR-16: unreviewed after this many days, the result is listed for the clinician and the head (signed). */
  agedWindowDays: z.number().int().min(1).max(366),
  source,
});
export type PatientRelease = z.infer<typeof PatientReleasePayload>;

export const MinorsRulePayload = z.object({
  /** Groups a verified guardian of a child under 12 sees. */
  under12Guardian: z.array(z.enum(RELEASE_GROUPS)),
  /** Groups a verified guardian of a 12–17-year-old sees (the CSO signs each). */
  adolescentGuardian: z.array(z.enum(RELEASE_GROUPS)),
  /** Whether a 12–17-year-old sees their own results, as the legal opinion says. */
  adolescentOwnAccess: z.boolean(),
  legalOpinionRef: z.string().trim().min(3).max(200),
});
export type MinorsRule = z.infer<typeof MinorsRulePayload>;

/** PR-12, A5: the consent wording, signed by the data protection lead; signing publishes the consent version. */
export const ResultsConsentNoticePayload = z.object({
  version: z.string().regex(/^[0-9A-Za-z.-]{1,20}$/),
  inApp: z.string().trim().min(20).max(2000),
  sms: z.string().trim().min(20).max(2000),
  basis: z.string().trim().min(3).max(200),
});

export const FloorAdditionsPayload = z.object({
  testCodes: z.array(z.string().regex(/^test\.[a-z0-9_]+$/)).min(1),
  reason: z.string().trim().min(3).max(300),
});

/* ─── PR-1: the decision table ──────────────────────────────────────── */
export type ReportStatus =
  | "preliminary"
  | "final"
  | "amended"
  | "corrected"
  | "cancelled"
  | "entered_in_error";
export interface ResultSnapshot {
  test: TestFacts;
  status: ReportStatus;
  /** No later version supersedes this one. */
  current: boolean;
  critical: boolean;
  /** A1: a `seen` or `acted` acknowledgement of this version by a clinician. */
  reviewed: boolean;
  /** PR-4: a told event for this version. */
  told: boolean;
  /** PR-7: the latest hold event for the logical result, if any. */
  hold: { kind: "set" | "extend" | "release"; untilOn: string | null } | null;
  referred: boolean;
  bedside: boolean;
  /** PR-5: an earlier version of this result was visible to the patient. */
  earlierSeen: boolean;
}
export interface ViewerContext {
  viewer: "patient" | "guardian";
  /** The patient's age in whole years today. */
  patientAge: number;
  /** PR-12: "Show my results in the app" in force. */
  consent: boolean;
  rules: PatientRelease | null;
  minors: MinorsRule | null;
  floorAdditions: readonly string[];
}
export type Reason =
  | "never_shown"
  | "minor"
  | "no_consent"
  | "not_released"
  | "rules_unsigned"
  | "group_rule"
  | "being_checked"
  | "not_reviewed"
  | "not_told"
  | "held"
  | "visible";

/** PR-6, 5.5: the group a result's release rule comes from. */
export function groupOf(
  r: Pick<ResultSnapshot, "critical" | "referred" | "bedside" | "earlierSeen">,
): ReleaseGroup {
  if (r.earlierSeen) return "corrected";
  if (r.critical) return "critical";
  if (r.referred) return "referred";
  if (r.bedside) return "bedside";
  return "routine";
}

/** PR-11: may this viewer see a result of this group, given the patient's age and the signed minors rule? */
export function minorAllows(ctx: ViewerContext, group: ReleaseGroup): boolean {
  if (ctx.patientAge >= 18) return ctx.viewer === "patient";
  if (!ctx.minors) return false; // nothing for under-18s until the rule is signed (Law 10)
  if (ctx.patientAge < 12)
    return ctx.viewer === "guardian" && ctx.minors.under12Guardian.includes(group);
  return ctx.viewer === "guardian"
    ? ctx.minors.adolescentGuardian.includes(group)
    : ctx.minors.adolescentOwnAccess;
}

/** PR-1: visible only when every check holds; the first failing check is the reason (gate-a §3). */
export function visibleToPatient(
  r: ResultSnapshot,
  ctx: ViewerContext,
): { visible: boolean; reason: Reason } {
  const no = (reason: Reason) => ({ visible: false, reason });
  if (neverShown(r.test, ctx.floorAdditions)) return no("never_shown");
  const group = groupOf(r);
  if (!minorAllows(ctx, group)) return no("minor");
  if (!ctx.consent) return no("no_consent");
  if (!r.current || !["final", "amended", "corrected"].includes(r.status))
    return no("not_released");
  if (!ctx.rules) return no("rules_unsigned");
  const rule = ctx.rules.groups[group];
  if (rule.inApp === "never") return no("group_rule");
  if (r.earlierSeen && !r.reviewed) return no("being_checked");
  if (!r.reviewed) return no("not_reviewed");
  if ((r.critical || rule.inApp === "after_told") && !r.told) return no("not_told");
  if (r.hold && r.hold.kind !== "release") return no("held");
  return { visible: true, reason: "visible" };
}

/* ─── PR-7: holds ───────────────────────────────────────────────────── */
export const HOLD_REASONS = ["explain_in_person", "harm_to_patient"] as const;
/** A hold needs a reason and an until-date no later than the signed maximum. */
export function holdErrors(
  h: { reason: string | null; untilOn: string | null },
  today: string,
  holdMaxDays: number | null,
): string[] {
  const e: string[] = [];
  if (!h.reason || !(HOLD_REASONS as readonly string[]).includes(h.reason))
    e.push("reason_required");
  if (!h.untilOn) e.push("until_required");
  else if (h.untilOn < today) e.push("until_past");
  else if (holdMaxDays === null) e.push("max_unsigned");
  else if (daysBetween(today, h.untilOn) > holdMaxDays) e.push("until_beyond_max");
  return e;
}
/** An expired hold returns to the clinician for review, never to the patient (PR-7). */
export const holdExpired = (h: { kind: string; untilOn: string | null }, today: string) =>
  h.kind !== "release" && h.untilOn !== null && h.untilOn < today;

/* ─── PR-8: status words ────────────────────────────────────────────── */
export type StatusWord = "within" | "higher" | "lower" | "no_range";
export function statusWord(s: {
  flag: "low" | "high" | "normal" | null;
  rangeLow: string | null;
  rangeHigh: string | null;
}): StatusWord {
  if (s.rangeLow === null && s.rangeHigh === null) return "no_range";
  if (s.flag === "high") return "higher";
  if (s.flag === "low") return "lower";
  if (s.flag === "normal") return "within";
  return "no_range";
}

/* ─── PR-9: the range line ──────────────────────────────────────────── */
export interface RangeLine {
  min: number;
  max: number;
  bandFrom: number;
  bandTo: number;
  value: number;
  /** An open-ended range (only one bound). */
  openLow: boolean;
  openHigh: boolean;
}
/**
 * Scale bounds from the snapshotted range and the value: the band sits in the middle half when both ends exist,
 * and the scale always contains the value. Qualitative results and a missing range give no line.
 */
export function rangeLine(
  value: number | null,
  low: number | null,
  high: number | null,
): RangeLine | null {
  if (value === null || !Number.isFinite(value) || (low === null && high === null)) return null;
  // An open low end ("< 5") starts the band at zero; an open high end ("> 5") runs past the value.
  const lo = low ?? 0;
  const hi = high ?? Math.max((low as number) * 2, value);
  const width = hi - lo || Math.abs(hi) || 1;
  const min = Math.min(lo - width / 2, value - width / 10);
  const max = Math.max(hi + width / 2, value + width / 10);
  return {
    min,
    max,
    bandFrom: lo,
    bandTo: hi,
    value,
    openLow: low === null,
    openHigh: high === null,
  };
}
/** The text alternative (§10): "Your result, 168, is above the usual range of 53 to 106 {unit}". */
export function rangeWords(
  value: string,
  unit: string,
  low: string | null,
  high: string | null,
  word: StatusWord,
) {
  const range =
    low !== null && high !== null
      ? `${low} to ${high}`
      : low !== null
        ? `above ${low}`
        : high !== null
          ? `below ${high}`
          : null;
  if (!range) return `Your result is ${value} ${unit}. There is no usual range for this test.`;
  const where = word === "higher" ? "above" : word === "lower" ? "below" : "within";
  return `Your result, ${value}, is ${where} the usual range of ${range} ${unit}.`;
}

/* ─── PR-16: aged results ───────────────────────────────────────────── */
export const isAged = (releasedOn: string, today: string, agedWindowDays: number | null) =>
  agedWindowDays !== null && daysBetween(releasedOn, today) > agedWindowDays;

/* ─── PR-17: language ───────────────────────────────────────────────── */
export function pickLanguage<T>(
  byLanguage: Record<string, T>,
  chosen: string,
): { lang: string; text: T | null; fallback: boolean } {
  if (byLanguage[chosen]) return { lang: chosen, text: byLanguage[chosen]!, fallback: false };
  return { lang: "en", text: byLanguage.en ?? null, fallback: chosen !== "en" };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
