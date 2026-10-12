/**
 * Reference ranges (Lab Phase 1, §6.2, rules RR-1 to RR-8; ADR 0241). Pure.
 *
 * Only a signed version in force at the time asked is used. A sex-specific band beats an "any" band;
 * age is in whole days at collection, `from` inclusive and `to` exclusive; a band never stretches past
 * its ages, so an adult band is never used for a child. Nothing here carries a clinical number.
 */
import type { Measure } from "@/lib/lab/catalogue";

import { compareDecimal, isDecimal } from "@/lib/lab/catalogue";

export type Sex = "female" | "male";
export type SignedStatus = "draft" | "signed" | "superseded";

export interface RangeBand {
  id: string;
  sex: Sex | "any";
  ageFromDays: number | null;
  ageToDays: number | null;
  low: string | null;
  high: string | null;
  /** ME-2: a band for one method only; null or absent = any method. */
  methodCode?: string | null;
  /** RI-6: an alternative the laboratory lead rejected; never used, never checked. */
  rejected?: boolean;
}

export interface RangeVersion {
  id: string;
  hospitalId: string;
  testId: string;
  conceptId: string;
  unitUcum: string;
  version: number;
  status: SignedStatus;
  inForceFrom: Date | null;
  supersededAt: Date | null;
  bands: RangeBand[];
}

/** A signed (or since superseded) set that was in force at `at` (RR-2; DT-5 asks about the past). */
export function inForceAt(
  v: { status: SignedStatus; inForceFrom: Date | null; supersededAt: Date | null },
  at: Date,
): boolean {
  if (v.status === "draft" || !v.inForceFrom) return false;
  return v.inForceFrom <= at && (!v.supersededAt || at < v.supersededAt);
}

/**
 * Whole days from date of birth to collection (RR-4), on calendar dates in the hospital's time zone
 * (Africa/Kampala, as the access rule's hospital day): a sample taken at 01:00 local is that day's.
 * Null when unknown.
 */
export function ageDaysAt(
  dateOfBirth: string | null,
  collectedAt: Date,
  timeZone = "Africa/Kampala",
): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const dob = Date.parse(`${dateOfBirth}T00:00:00Z`);
  const day = Date.parse(`${collectedAt.toLocaleDateString("en-CA", { timeZone })}T00:00:00Z`);
  const days = Math.floor((day - dob) / 86_400_000);
  return days >= 0 ? days : null;
}

export type RangeReason =
  | "no_band_for_age"
  | "sex_or_age_missing"
  | "no_signed_range"
  | "not_numeric";

export type ResolvedRange =
  | { kind: "band"; band: RangeBand; version: RangeVersion }
  | { kind: "none"; reason: RangeReason; conflict?: string[] };

export interface RangeQuery {
  measure: Pick<Measure, "resultType" | "unitUcum"> & { testId: string; conceptId: string };
  hospitalId: string;
  sex: Sex | null;
  ageDaysAtCollection: number | null;
  at: Date;
  /** ME-2: the method in force; method-specific bands first, then bands naming none. */
  methodCode?: string | null;
}

const needsAge = (b: RangeBand) => b.ageFromDays !== null || b.ageToDays !== null;
const coversAge = (b: RangeBand, days: number) =>
  (b.ageFromDays === null || days >= b.ageFromDays) && (b.ageToDays === null || days < b.ageToDays);

/** RR-1: one band, or the reason there is none. */
export function resolveRange(q: RangeQuery, versions: readonly RangeVersion[]): ResolvedRange {
  if (q.measure.resultType !== "number") return { kind: "none", reason: "not_numeric" };
  const version = versions
    .filter(
      (v) =>
        v.hospitalId === q.hospitalId &&
        v.testId === q.measure.testId &&
        v.conceptId === q.measure.conceptId &&
        v.unitUcum === q.measure.unitUcum && // RR-6: another unit is never applied
        inForceAt(v, q.at),
    )
    .sort((a, b) => b.version - a.version)[0];
  if (!version) return { kind: "none", reason: "no_signed_range" };

  // ME-2: a band for another method is never used; one for this method beats one naming none.
  const live = version.bands.filter(
    (b) => !b.rejected && (!b.methodCode || b.methodCode === (q.methodCode ?? null)),
  );
  // RR-5: a missing sex or age reaches only the bands that do not need it.
  const matching = live.filter(
    (b) =>
      (b.sex === "any" || b.sex === q.sex) &&
      (needsAge(b) ? q.ageDaysAtCollection !== null && coversAge(b, q.ageDaysAtCollection) : true),
  );
  const own = matching.filter((b) => b.methodCode);
  const usable = own.length ? own : matching;
  const specific = usable.filter((b) => b.sex !== "any");
  const pool = specific.length > 0 ? specific : usable; // RR-3
  if (pool.length === 1) return { kind: "band", band: pool[0]!, version };
  if (pool.length > 1)
    return { kind: "none", reason: "no_signed_range", conflict: pool.map((b) => b.id) };

  const missing = q.sex === null || q.ageDaysAtCollection === null;
  const wouldNeed = live.some((b) => b.sex !== "any" || needsAge(b));
  return { kind: "none", reason: missing && wouldNeed ? "sex_or_age_missing" : "no_band_for_age" };
}

/** RR-6 and the shape checks: what makes a draft unsignable. Bands of one sex may not overlap; a sex band over an "any" band is allowed (RR-3). */
export function rangeSignErrors(
  v: Pick<RangeVersion, "unitUcum" | "bands">,
  measure: Pick<Measure, "resultType" | "unitUcum">,
): string[] {
  const errors: string[] = [];
  if (measure.resultType !== "number") errors.push("not_numeric");
  if (v.unitUcum !== measure.unitUcum) errors.push("unit_mismatch");
  const bands = v.bands.filter((b) => !b.rejected); // RI-6: a rejected alternative is not checked
  if (bands.length === 0) errors.push("no_bands");
  for (const b of bands) {
    if (b.low === null && b.high === null) errors.push(`band_empty:${b.id}`);
    if ((b.low !== null && !isDecimal(b.low)) || (b.high !== null && !isDecimal(b.high)))
      errors.push(`band_not_decimal:${b.id}`);
    else if (b.low !== null && b.high !== null && compareDecimal(b.low, b.high) > 0)
      errors.push(`band_order:${b.id}`);
    if (b.ageFromDays !== null && b.ageToDays !== null && b.ageFromDays >= b.ageToDays)
      errors.push(`band_ages:${b.id}`);
  }
  const lo = (b: RangeBand) => b.ageFromDays ?? 0;
  const hi = (b: RangeBand) => b.ageToDays ?? Number.POSITIVE_INFINITY;
  bands.forEach((a, i) =>
    bands.slice(i + 1).forEach((b) => {
      if (
        a.sex === b.sex &&
        (a.methodCode ?? null) === (b.methodCode ?? null) &&
        lo(a) < hi(b) &&
        lo(b) < hi(a)
      )
        errors.push(`band_overlap:${a.id}:${b.id}`);
    }),
  );
  return errors;
}
