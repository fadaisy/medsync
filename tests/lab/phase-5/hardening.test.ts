import type { ResultSnapshot, ViewerContext } from "@/lib/lab/patient-release";
import { describe, expect, it } from "vitest";

import { evaluate } from "@/lib/lab/delta";
import {
  NEVER_SHOWN_CLASSES,
  NEVER_SHOWN_GROUPS,
  NEVER_SHOWN_TEST_CODES,
  RELEASE_GROUPS,
  visibleToPatient,
} from "@/lib/lab/patient-release";

/**
 * Lab Phase 5 Step 11: the PR-3 property and the Section 11 server-side budgets. The property draws 200,000 random
 * snapshots, viewers and signed settings (a seeded generator, so a failure replays) and asserts that no setting,
 * however permissive, ever shows a never-shown test; and that "never_shown" is never the reason for any other test.
 */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STATUSES = [
  "preliminary",
  "final",
  "amended",
  "corrected",
  "cancelled",
  "entered_in_error",
] as const;
const IN_APP = ["after_review", "after_told", "never"] as const;

function draw(r: () => number) {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const bool = () => r() < 0.5;
  const additions = bool() ? ["test.fx_added"] : [];
  const kind = Math.floor(r() * 5);
  const test =
    kind === 0
      ? { code: "test.fx", restrictedClass: pick(NEVER_SHOWN_CLASSES), patientGroup: null }
      : kind === 1
        ? { code: pick(NEVER_SHOWN_TEST_CODES), restrictedClass: null, patientGroup: null }
        : kind === 2
          ? { code: "test.fx", restrictedClass: null, patientGroup: pick(NEVER_SHOWN_GROUPS) }
          : kind === 3 && additions.length
            ? { code: "test.fx_added", restrictedClass: null, patientGroup: null }
            : {
                code: "test.fx",
                restrictedClass: bool() ? "other_class" : null,
                patientGroup: bool() ? "routine_group" : null,
              };
  const snapshot: ResultSnapshot = {
    test,
    status: pick(STATUSES),
    current: bool(),
    critical: bool(),
    reviewed: bool(),
    told: bool(),
    hold: pick([
      null,
      { kind: "set" as const, untilOn: "2026-11-01" },
      { kind: "release" as const, untilOn: null },
    ]),
    referred: bool(),
    bedside: bool(),
    earlierSeen: bool(),
  };
  const groups = Object.fromEntries(
    RELEASE_GROUPS.map((g) => [g, { inApp: pick(IN_APP), sms: bool() }]),
  ) as NonNullable<ViewerContext["rules"]>["groups"];
  const ctx: ViewerContext = {
    viewer: bool() ? "patient" : "guardian",
    patientAge: pick([5, 15, 40]),
    consent: bool(),
    rules: bool()
      ? { groups, holdMaxDays: 30, agedWindowDays: 7, source: { doc: "fx", date: "fx" } }
      : null,
    minors: bool()
      ? {
          under12Guardian: [...RELEASE_GROUPS],
          adolescentGuardian: [...RELEASE_GROUPS],
          adolescentOwnAccess: true,
          legalOpinionRef: "fx",
        }
      : null,
    floorAdditions: additions,
  };
  const never = kind <= 2 || (kind === 3 && additions.length > 0);
  return { snapshot, ctx, never };
}

describe("PR-3 property: a never-shown test is never visible, whatever is signed", () => {
  it("holds over 200,000 random snapshots, viewers and settings", () => {
    const r = rng(20261017);
    let never = 0;
    for (let i = 0; i < 200_000; i++) {
      const d = draw(r);
      const v = visibleToPatient(d.snapshot, d.ctx);
      if (d.never) {
        never += 1;
        expect(v).toEqual({ visible: false, reason: "never_shown" });
      } else expect(v.reason).not.toBe("never_shown");
    }
    expect(never).toBeGreaterThan(50_000);
  });
});

describe("Section 11 budgets (server side, pure parts)", () => {
  it("visibleToPatient over a patient's 500 results takes under 50 ms", () => {
    const r = rng(7);
    const xs = Array.from({ length: 500 }, () => draw(r));
    const t0 = performance.now();
    for (const x of xs) visibleToPatient(x.snapshot, x.ctx);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("delta evaluation takes well under 50 ms per component", () => {
    const rule = {
      concept: "obs.fx",
      type: "absolute",
      limit: { both: 10 },
      windowHours: 168,
      basis: { kind: "clinical", approver: "fx", rationale: "fx" },
      applicability: { ageFromYears: null, ageToYears: null, specimen: null },
      acrossMethods: false,
      meaning: "fx",
      source: "fx",
    } as unknown as Parameters<typeof evaluate>[0];
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) evaluate(rule, 80, 80 + (i % 40), 24);
    expect((performance.now() - t0) / 1000).toBeLessThan(1);
  });
});
