/**
 * Lab Phase 1 engine fixtures. Every number here is INVENTED for tests (Law 5): none is a clinical
 * limit, range or response time, and none may be copied into a seed or a sign-off pack.
 */
import type { CriticalLimitVersion } from "@/lib/lab/flags";
import type { RangeVersion } from "@/lib/lab/ranges";

export const H_A = "hospital-a";
export const H_B = "hospital-b";
export const TEST = "test-fixture-chem";
export const CONCEPT = "obs.fixture_analyte";
export const UNIT = "mmol/L";

export const T0 = new Date("2026-10-11T08:00:00Z");
export const minutes = (n: number, from = T0) => new Date(from.getTime() + n * 60_000);

export const measure = {
  testId: TEST,
  conceptId: CONCEPT,
  resultType: "number" as const,
  unitUcum: UNIT,
};

/** Fixture ranges: invented bands, with an adult "any", sex bands for adults, and a neonatal band. */
export function fixtureRanges(overrides: Partial<RangeVersion> = {}): RangeVersion {
  return {
    id: "rv-a-1",
    hospitalId: H_A,
    testId: TEST,
    conceptId: CONCEPT,
    unitUcum: UNIT,
    version: 1,
    status: "signed",
    inForceFrom: minutes(-60 * 24 * 30),
    supersededAt: null,
    bands: [
      { id: "neonate", sex: "any", ageFromDays: 0, ageToDays: 28, low: "10", high: "20" },
      { id: "child", sex: "any", ageFromDays: 28, ageToDays: 6570, low: "30", high: "40" },
      { id: "adult-f", sex: "female", ageFromDays: 6570, ageToDays: null, low: "50", high: "60" },
      { id: "adult-m", sex: "male", ageFromDays: 6570, ageToDays: null, low: "55", high: "65" },
      { id: "adult-any", sex: "any", ageFromDays: 6570, ageToDays: null, low: "52", high: "62" },
    ],
    ...overrides,
  };
}

/** Fixture critical limits: invented; one adult limit, one neonatal, one-sided high for a second analyte. */
export function fixtureLimits(overrides: Partial<CriticalLimitVersion> = {}): CriticalLimitVersion {
  return {
    id: "clv-a-1",
    hospitalId: H_A,
    version: 1,
    status: "signed",
    inForceFrom: minutes(-60 * 24 * 30),
    supersededAt: null,
    limits: [
      {
        id: "lim-adult",
        testId: TEST,
        conceptId: CONCEPT,
        unitUcum: UNIT,
        ageFromDays: 6570,
        ageToDays: null,
        low: "5",
        high: "95",
      },
      {
        id: "lim-neonate",
        testId: TEST,
        conceptId: CONCEPT,
        unitUcum: UNIT,
        ageFromDays: 0,
        ageToDays: 28,
        low: "2",
        high: "30",
      },
      {
        id: "lim-other",
        testId: TEST,
        conceptId: "obs.fixture_other",
        unitUcum: "U/L",
        ageFromDays: null,
        ageToDays: null,
        low: null,
        high: "500",
      },
    ],
    ...overrides,
  };
}

/** A deterministic PRNG (mulberry32) for the property tests: no new dependency. */
export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
  };
}
