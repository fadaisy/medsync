/** Phase 2: the evaluator's semantics, independent of content. */
import type { State } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { diabetesPack, runDiabetesPack } from "@/lib/ncd/pack";
import { and, atLeast, effectiveBand, or } from "@/lib/ncd/pack/engine";

const S: State[] = ["met", "not_met", "insufficient", "unavailable"];

describe("four-state truth tables (ADR 0082)", () => {
  it("AND: not met wins, then unavailable, then insufficient", () => {
    for (const a of S)
      for (const b of S) {
        const want = [a, b].includes("not_met")
          ? "not_met"
          : [a, b].includes("unavailable")
            ? "unavailable"
            : [a, b].includes("insufficient")
              ? "insufficient"
              : "met";
        expect(and([a, b])).toBe(want);
      }
  });
  it("OR: met wins, then insufficient (do the test you can), then unavailable", () => {
    for (const a of S)
      for (const b of S) {
        const want = [a, b].includes("met")
          ? "met"
          : [a, b].includes("insufficient")
            ? "insufficient"
            : [a, b].includes("unavailable")
              ? "unavailable"
              : "not_met";
        expect(or([a, b])).toBe(want);
      }
  });
  it("atLeast counts what could still be met", () => {
    expect(atLeast(["met", "met", "not_met"], 2)).toBe("met");
    expect(atLeast(["met", "not_met", "not_met"], 2)).toBe("not_met");
    expect(atLeast(["met", "insufficient", "not_met"], 2)).toBe("insufficient");
    expect(atLeast(["met", "unavailable", "not_met"], 2)).toBe("unavailable");
    expect(atLeast(["insufficient", "unavailable"], 2)).toBe("unavailable");
    expect(atLeast(["insufficient", "insufficient", "unavailable"], 2)).toBe("insufficient");
  });
});

describe("missing is never normal", () => {
  it.each(["referral", "district"] as const)(
    "an empty record fires nothing and stages nothing (%s)",
    (site) => {
      for (const ageBand of ["child", "adolescent", "adult", "older_adult"] as const)
        for (const established of [false, true]) {
          const r = runDiabetesPack({ values: {}, site, established, ageBand });
          expect(r.fired).toEqual({});
          expect(r.stages).toEqual({});
          expect(r.bands).toEqual({});
          expect(
            Object.values(r.complications).filter((s) => s === "met" || s === "not_met"),
          ).toEqual([]);
        }
    },
  );
});

describe("effective bands follow a recorded age (P0-01, U12, V16)", () => {
  it("16 is adult; 10 to 15 adolescent; under 10 child", () => {
    expect(effectiveBand("adult", 15)).toBe("adolescent");
    expect(effectiveBand("adult", 9)).toBe("child");
    expect(effectiveBand("adolescent", 17)).toBe("adult");
    expect(effectiveBand("child", 13)).toBe("adolescent");
    expect(effectiveBand("adult", undefined)).toBe("adult");
  });
});

describe("dark is reported, never shown (N11)", () => {
  it("an item with enabled:false never appears in fired", () => {
    const dark = new Set(
      [...diabetesPack().rules, ...diabetesPack().management]
        .filter((i) => i.x.enabled === false)
        .map((i) => i.id),
    );
    const r = runDiabetesPack({
      values: {
        age_years: 50,
        sex: "male",
        polyuria: true,
        random_pg: 14,
        dm_status: "known",
        dm_type_recorded: "type_2",
      },
      site: "referral",
      established: false,
      ageBand: "adult",
    });
    expect(Object.keys(r.fired).filter((k) => dark.has(k))).toEqual([]);
  });
});
