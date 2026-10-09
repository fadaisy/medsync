/** The record's values a stage reads (STG-04/05): windows, units, baseline, blank never negative. */
import { describe, expect, it } from "vitest";

import { stageInputsFrom } from "@/lib/clerking/impression/stage-inputs";
import { stageOf } from "@/lib/clerking/impression/stages";
import { NOW, scenario, toCtx } from "./exam-fixtures";

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.parse(NOW) - h * HOUR).toISOString();
const fact = (concept: string, value: number, hours: number) => ({
  concept,
  value,
  at: ago(hours),
  trust: 4 as const,
});
const ctx = (facts: ReturnType<typeof fact>[]) => toCtx({ ...scenario(), facts, now: NOW });

describe("stage inputs from the record", () => {
  it("converts haemoglobin to g/L and ignores one older than 7 days", () => {
    expect(stageInputsFrom(ctx([fact("obs.haemoglobin", 6.2, 5)])).hbGPerL).toBe(62);
    expect(stageInputsFrom(ctx([fact("obs.haemoglobin", 6.2, 24 * 8)])).hbGPerL).toBeNull();
  });

  it("AKI baseline is the lowest creatinine in the 90 days before the current one", () => {
    const i = stageInputsFrom(
      ctx([
        fact("obs.creatinine", 260, 2),
        fact("obs.creatinine", 95, 24 * 30),
        fact("obs.creatinine", 110, 24 * 60),
        fact("obs.creatinine", 70, 24 * 200),
      ]),
    );
    expect(i.creatinineUmol).toBe(260);
    expect(i.baselineCreatinineUmol).toBe(95);
    expect(stageOf("dx.aki", i)).toMatchObject({ code: "2" });
  });

  it("no baseline, no AKI stage; no urea, CRB-65", () => {
    const i = stageInputsFrom(ctx([fact("obs.creatinine", 260, 2)]));
    expect(i.baselineCreatinineUmol).toBeNull();
    expect(stageOf("dx.aki", i)).toMatchObject({ insufficient: ["baseline creatinine"] });
    expect(i.ureaMmol).toBeNull();
  });
});
