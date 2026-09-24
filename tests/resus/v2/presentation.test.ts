import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AIRWAY_STATES } from "@/lib/resus/airway";
import { EMPTY_LOCAL } from "@/lib/resus/model";
import { AIRWAY_DIFFICULTY, airwayAction } from "@/lib/resus/reference/airway-catalog";
import { BREATHING_STATES } from "@/lib/resus/reference/breathing-catalog";
import { CIRCULATORY_STATES } from "@/lib/resus/reference/circulation-catalog";
import {
  DISABILITY_FINDING_CODE_SET,
  DISABILITY_STATES,
} from "@/lib/resus/reference/disability-catalog";
import { EXPOSURE_FINDING_CODE_SET, EXPOSURE_STATES } from "@/lib/resus/reference/exposure-catalog";
import {
  SEARCH_SYNONYMS,
  STEP_LOCAL_CONTROLS,
  STEP_PRESENTATION,
  SURVEY_RULE_IDS,
} from "@/lib/resus/reference/presentation";
import { ABCDE_LETTERS } from "@/lib/resus/types";

/** GATE A §3 — presentation metadata is signed-catalog codes only (SV-DIS-08). */

const codes = (s: (typeof ABCDE_LETTERS)[number]) =>
  new Set(STEP_PRESENTATION[s].findings.map((f) => f.code));

describe("SV-DIS-08 — every code exists in the step's signed catalog", () => {
  it.each(ABCDE_LETTERS)("SV-DIS-08: %s key, promoted and derived codes are catalog codes", (s) => {
    const p = STEP_PRESENTATION[s];
    const all = [...p.key, ...p.promotions.flatMap((x) => x.codes), ...p.derived];
    expect(all.filter((c) => !codes(s).has(c))).toEqual([]);
  });
  it("SV-DIS-08: D and E findings equal the catalogs' own code sets (minus no_pulse)", () => {
    const strip = (set: ReadonlySet<string>) => new Set([...set].filter((c) => c !== "no_pulse"));
    expect(codes("D")).toEqual(strip(DISABILITY_FINDING_CODE_SET));
    expect(codes("E")).toEqual(strip(EXPOSURE_FINDING_CODE_SET));
  });
  it("SV-DIS-08: ladders are the engines' signed state arrays; overall ⊆ ladder or patency", () => {
    const ladders = {
      A: AIRWAY_STATES,
      B: BREATHING_STATES,
      C: CIRCULATORY_STATES,
      D: DISABILITY_STATES,
      E: EXPOSURE_STATES,
    };
    for (const s of ABCDE_LETTERS) expect(STEP_PRESENTATION[s].ladder).toEqual(ladders[s]);
    for (const s of ["B", "C", "D", "E"] as const)
      for (const o of STEP_PRESENTATION[s].overall) expect(ladders[s]).toContain(o);
  });
  it("SV-DIS-08: no step lists a code twice; key ≤ 8; promoted codes are not key", () => {
    for (const s of ABCDE_LETTERS) {
      const p = STEP_PRESENTATION[s];
      expect(codes(s).size).toBe(p.findings.length);
      expect(p.key.length).toBeLessThanOrEqual(8);
      for (const pr of p.promotions) for (const c of pr.codes) expect(p.key).not.toContain(c);
    }
    expect(STEP_PRESENTATION.D.promotionCap).toBe(2);
  });
  it("SV-DIS-08: every synonym code is a code of at least one step", () => {
    const every = new Set(ABCDE_LETTERS.flatMap((s) => [...codes(s)]));
    const missing = Object.values(SEARCH_SYNONYMS)
      .flat()
      .filter((c) => !every.has(c));
    expect(missing).toEqual([]);
  });
  it("SV-DIS-08: step-local controls point at real toggles, codes and actions", () => {
    for (const c of STEP_LOCAL_CONTROLS) {
      if (c.toggle) expect(Object.keys(EMPTY_LOCAL)).toContain(c.toggle);
      if (c.suggestedBy) expect(STEP_PRESENTATION.B.derived).toContain(c.suggestedBy);
      for (const a of c.autoOpenOn ?? []) expect(airwayAction(a)?.tier).toBe(3);
    }
    const screen = STEP_LOCAL_CONTROLS.find((c) => c.id === "a_difficulty_screen")!;
    expect(screen.codes).toEqual(AIRWAY_DIFFICULTY.map((d) => d.code));
    expect(screen.collapsed).toBe(true);
  });
});

describe("rule-ID coverage", () => {
  it("SV-DIS-08: every SURVEY_RULE_IDS entry names at least one test in tests/resus/v2", () => {
    const dir = join(process.cwd(), "tests/resus/v2");
    const text = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    const named = new Set([...text.matchAll(/["'`](SV-[A-Z]+-\d{2}):/g)].map((m) => m[1]));
    expect(SURVEY_RULE_IDS.filter((id) => !named.has(id))).toEqual([]);
  });
});
