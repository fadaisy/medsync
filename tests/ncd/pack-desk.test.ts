/**
 * The diabetes pack in the ten-step desk (ADR 0216): its result becomes flags, the Impression's
 * diabetes verdict and the profile card's visibility. Built on the pack's own vignettes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackInput, PackValues } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { diabetesPack } from "@/lib/ncd/pack";
import { deskDiabetes } from "@/lib/ncd/pack/desk";

interface Vignette {
  id: string;
  site: "referral" | "district";
  established: boolean;
  ageBand: PackInput["ageBand"];
  values: PackValues;
}
const VIGNETTES = (
  JSON.parse(readFileSync(join(__dirname, "fixtures", "diabetes-pack-vignettes.json"), "utf8")) as {
    vignettes: Vignette[];
  }
).vignettes;
const input = (id: string): PackInput => {
  const v = VIGNETTES.find((x) => x.id === id)!;
  return { values: v.values, site: v.site, established: v.established, ageBand: v.ageBand };
};
const pack = diabetesPack();

describe("the diabetes pack in the clerking desk", () => {
  it("stays away on an empty record: no flags, no verdict to lead with, no card", () => {
    const d = deskDiabetes(pack, {
      values: {},
      site: "referral",
      established: false,
      ageBand: "adult",
    });
    expect(d.flags).toEqual([]);
    expect(d.show).toBe(false);
    expect(d.verdict?.state).not.toBe("met");
  });

  it("words a met Uganda 2026 verdict with the criterion that met it", () => {
    const d = deskDiabetes(pack, {
      // A woman of 46 with pregnancy unrecorded would hold the set back until it is answered.
      values: { age_years: 46, sex: "male", polyuria: true, random_pg: 14.2 },
      site: "referral",
      established: false,
      ageBand: "adult",
    });
    expect(d.verdict?.state).toBe("met");
    expect(d.verdict?.words).toMatch(/^Uganda 2026 criteria met: /);
    expect(d.show).toBe(true);
  });

  it("explains a met criterion part by part, as the engine judged it", () => {
    const d = deskDiabetes(pack, {
      values: { age_years: 46, sex: "male", polyuria: true, random_pg: 14.2 },
      site: "referral",
      established: false,
      ageBand: "adult",
    });
    const met = d.criteria.ug_integrated_dm_2026!.filter((c) => c.state === "met");
    expect(met.length).toBeGreaterThan(0);
    const parts = met.flatMap((c) => c.parts);
    expect(parts).toContainEqual(
      expect.objectContaining({ feature: "random_pg", state: "met", value: "14.2" }),
    );
    expect(parts).toContainEqual(
      expect.objectContaining({ feature: "polyuria", state: "met", value: "true" }),
    );
    // A part with nothing recorded is "insufficient", never "not met".
    expect(parts.find((p) => p.feature === "polydipsia")?.state ?? "insufficient").toBe(
      "insufficient",
    );
  });

  it("calls one high glucose without a symptom possible, not diabetes", () => {
    const d = deskDiabetes(pack, {
      values: { age_years: 46, sex: "male", random_pg: 14.2 },
      site: "referral",
      established: false,
      ageBand: "adult",
    });
    expect(d.verdict?.state).toBe("insufficient");
    expect(d.verdict?.words).toMatch(/^Possible diabetes/);
  });

  it("raises the interrupt as one urgent flag and medicines as flags from Medicines", () => {
    const d = deskDiabetes(pack, input("DMV-10"));
    const urgent = d.flags.filter((f) => f.level === "urgent");
    expect(urgent.some((f) => f.badge === "Diabetes: act now")).toBe(true);
    expect(d.flags.filter((f) => f.badge === "Diabetes: act now")).toHaveLength(1);
    for (const f of d.flags.filter((f) => f.where === "Medicines")) expect(f.section).toBe("pmh");
    expect(d.verdict).toBeNull(); // known diabetes: no new-diagnosis verdict
    expect(d.show).toBe(true);
  });

  it("every vignette yields flags only from fired items, and the card whenever anything fired", () => {
    for (const v of VIGNETTES) {
      const d = deskDiabetes(pack, input(v.id));
      for (const f of d.flags) expect(d.result.fired[f.ruleId] ?? d.result.interrupt).toBeTruthy();
      if (Object.keys(d.result.fired).length) expect(d.show, v.id).toBe(true);
    }
  });
});
