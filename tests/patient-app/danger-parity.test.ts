/** S2: the server's danger rule gives the patient's answer on every case, from the same thresholds file. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SugarContext } from "@patient-core/readings";
import { checkReading } from "@patient-core/readings";
import { describe, expect, it } from "vitest";

import thresholds from "@/supabase/functions/_shared/patient-thresholds.v0.json";
import { dangerOf } from "@/supabase/functions/_shared/reading-danger";

const root = resolve(__dirname, "../..");

describe("S2 danger rules, phone and server", () => {
  it("the server's thresholds file is a byte-identical copy", () => {
    expect(
      readFileSync(resolve(root, "supabase/functions/_shared/patient-thresholds.v0.json"), "utf8"),
    ).toBe(
      readFileSync(resolve(root, "packages/clinical-rules/patient-thresholds.v0.json"), "utf8"),
    );
  });

  it("blood pressure: same verdict on a full grid", () => {
    for (let top = 60; top <= 240; top += 2)
      for (let bottom = 30; bottom <= 150; bottom += 2) {
        const phone = checkReading({ kind: "bp", top, bottom }).level === "danger";
        expect(dangerOf({ kind: "bp", top, bottom }, thresholds) !== null, `${top}/${bottom}`).toBe(
          phone,
        );
      }
  });

  it("sugar: same verdict for every value and timing", () => {
    const contexts: SugarContext[] = ["fasting", "lunch", "supper", "after", "bedtime", "random"];
    for (let v = 1; v <= 30; v = Math.round((v + 0.1) * 10) / 10)
      for (const context of contexts) {
        const phone = checkReading({ kind: "sugar", value: v, context }).level === "danger";
        expect(dangerOf({ kind: "sugar", value: v }, thresholds) !== null, `${v} ${context}`).toBe(
          phone,
        );
      }
    expect(dangerOf({ kind: "sugar", value: 3.2 }, thresholds)).toBe("low_sugar");
  });

  it("pulse and weight", () => {
    for (let v = 20; v <= 200; v++) {
      const phone = checkReading({ kind: "pulse", value: v }).level === "danger";
      expect(dangerOf({ kind: "pulse", value: v }, thresholds) !== null, `${v}`).toBe(phone);
    }
    expect(dangerOf({ kind: "weight", value: 300 }, thresholds)).toBeNull();
  });
});
