import type { ReadingInput, ReadingLevel, SugarContext } from "@patient-core/readings";
import { SUGAR_CONTEXT_WORDS } from "@patient-core/readings";
import { describe, expect, it } from "vitest";

import {
  lastTimeLine,
  readingBand,
  readingToRow,
  recheckMinutes,
  rowToReading,
  saveButton,
  startValues,
} from "@/lib/patient-web/readings";
import rules from "../../packages/clinical-rules/patient-thresholds.v0.json";
import table from "../../packages/patient-core/fixtures/readings.json";

/** S6 (PROMPT-PATIENT-WEB-TIDE Step 3): the web's check band over the shared threshold data and table. */
const t = (n: number) => Math.round(n * 10) / 10;

describe("S6 · the check band", () => {
  it("matches every row of the shared phone/web table", () => {
    for (const row of table as { input: ReadingInput; level: ReadingLevel }[])
      expect(readingBand(row.input).level, JSON.stringify(row.input)).toBe(row.level);
  });

  it("sugar: every context at its target ±0.1 gives the right level and words", () => {
    for (const [ctx, max] of Object.entries(rules.sugar.targetMaxByContext)) {
      const context = ctx as SugarContext;
      const words = SUGAR_CONTEXT_WORDS[context];
      expect(readingBand({ kind: "sugar", value: t(max - 0.1), context })).toMatchObject({
        level: "ok",
        text: `In your target for ${words}`,
      });
      expect(readingBand({ kind: "sugar", value: max, context }).level).toBe("ok");
      expect(readingBand({ kind: "sugar", value: t(max + 0.1), context })).toMatchObject({
        level: "watch",
        text: `Above your target for ${words} (${max})`,
      });
      const low = rules.sugar.dangerLowBelow;
      expect(readingBand({ kind: "sugar", value: t(low - 0.1), context })).toMatchObject({
        level: "danger",
        text: "Too low",
        selfCare: "Eat or drink something sweet now.",
      });
      expect(readingBand({ kind: "sugar", value: low, context }).level).not.toBe("danger");
      const high = rules.sugar.dangerHighAtLeast;
      expect(readingBand({ kind: "sugar", value: t(high - 0.1), context }).level).toBe("watch");
      expect(readingBand({ kind: "sugar", value: high, context })).toMatchObject({
        level: "danger",
        text: "Very high",
      });
    }
  });

  it("bp and pulse edges from the threshold data", () => {
    const bp = rules.bp;
    expect(readingBand({ kind: "bp", top: bp.dangerTopAtLeast, bottom: 80 }).text).toBe(
      "Very high",
    );
    expect(readingBand({ kind: "bp", top: t(bp.dangerTopAtLeast - 0.1), bottom: 80 }).text).toBe(
      `Above your target of ${bp.aboveTopAtLeast}/${bp.aboveBottomAtLeast}`,
    );
    expect(readingBand({ kind: "bp", top: t(bp.aboveTopAtLeast - 0.1), bottom: 80 }).text).toBe(
      "In your range",
    );
    const p = rules.pulse;
    expect(readingBand({ kind: "pulse", value: t(p.dangerBelow - 0.1) }).level).toBe("danger");
    expect(readingBand({ kind: "pulse", value: t(p.dangerAbove + 0.1) }).level).toBe("danger");
    expect(readingBand({ kind: "pulse", value: p.unusualAbove + 1 }).text).toBe(
      "Outside the usual range",
    );
    expect(readingBand({ kind: "pulse", value: 70 }).text).toBe("Steady");
  });

  it("weight is never judged; empty asks for a number", () => {
    for (const value of [1, 40, 200, 300])
      expect(readingBand({ kind: "weight", value })).toMatchObject({
        level: "ok",
        text: "Saved to your trend",
      });
    expect(readingBand({ kind: "bp", top: 120, bottom: null })).toMatchObject({
      level: "empty",
      text: "Type your number, or use − and +",
    });
  });
});

describe("S6 · Save, the danger interrupt and chest pain", () => {
  it("a danger value turns Save into Save and get help, ", () => {
    const input: ReadingInput = { kind: "bp", top: 190, bottom: 100 };
    expect(saveButton(readingBand(input).level, false)).toEqual({
      disabled: false,
      help: true,
      label: "Save and get help",
    });
  });

  it("low sugar waits 15 minutes; others wait 5", () => {
    const low: ReadingInput = { kind: "sugar", value: 2.5, context: "bedtime" };
    expect(recheckMinutes(low)).toBe(15);
    expect(recheckMinutes({ kind: "sugar", value: 20, context: "fasting" })).toBe(5);
    expect(recheckMinutes({ kind: "pulse", value: 30 })).toBe(5);
  });

  it("chest pain with no number still goes for help; a calm reading saves", () => {
    expect(saveButton("empty", true)).toEqual({
      disabled: false,
      help: true,
      label: "Save and get help",
    });
    expect(saveButton("empty", false).disabled).toBe(true);
    expect(saveButton("ok", false)).toEqual({
      disabled: false,
      help: false,
      label: "Save reading",
    });
  });
});

describe("rows, start values and Last time", () => {
  it("round-trips a reading through the phone's row shape", () => {
    const sugar: ReadingInput = { kind: "sugar", value: 6.4, context: "after" };
    const row = readingToRow(sugar, ["dizzy"]);
    expect(row).toEqual({
      kind: "glucose",
      v1: 6.4,
      v2: null,
      unit: "mmol/L",
      note: "context:after; feel:dizzy",
    });
    const back = rowToReading({
      kind: row.kind,
      recordedAtIso: "2026-10-25T07:40:00",
      numericValue1: "6.4",
      numericValue2: null,
      unit: row.unit,
      note: row.note,
    });
    expect(back?.input).toEqual(sugar);
  });

  it("starts from the last reading of each kind and says when", () => {
    const readings = [
      { at: "2026-10-25T07:40:00", input: { kind: "bp", top: 138, bottom: 86 } as ReadingInput },
      { at: "2026-10-20T07:40:00", input: { kind: "bp", top: 150, bottom: 95 } as ReadingInput },
    ];
    expect(startValues(readings)).toMatchObject({ top: "138", bottom: "86", sugar: "" });
    const now = new Date("2026-10-25T12:00:00");
    expect(lastTimeLine(readings, "bp", now)).toBe("138/86 · today 07:40");
    expect(lastTimeLine(readings, "sugar", now)).toBe("No reading of this kind yet");
  });
});
