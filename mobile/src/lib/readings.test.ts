import rules from "@clinical-rules/patient-thresholds.v0.json";
import { judge } from "@patient-core/care-trends";

import { checkReading } from "@/lib/readings";

const bp = (top: number, bottom: number) => checkReading({ kind: "bp", top, bottom }).level;
const sugar = (
  value: number,
  context: "fasting" | "lunch" | "supper" | "after" | "bedtime" | "random",
) => checkReading({ kind: "sugar", value, context }).level;
const pulse = (value: number) => checkReading({ kind: "pulse", value }).level;

/** Every v0 threshold edge, ±0.1 (Gate 5 test). The numbers come from the rules file, not the test. */
describe("reading check, v0 thresholds (pending CSO)", () => {
  it("is marked pending CSO", () => expect(rules.status).toBe("pending-cso"));

  it("is empty until both numbers are typed", () => {
    expect(checkReading({ kind: "bp", top: 120, bottom: null }).level).toBe("empty");
    expect(checkReading({ kind: "sugar", value: null, context: "fasting" }).level).toBe("empty");
  });

  it("BP danger at the top and bottom edges", () => {
    const r = rules.bp;
    expect(bp(r.dangerTopAtLeast, 80)).toBe("danger");
    expect(bp(r.dangerTopAtLeast - 0.1, 80)).toBe("watch");
    expect(bp(130, r.dangerBottomAtLeast)).toBe("danger");
    expect(bp(130, r.dangerBottomAtLeast - 0.1)).toBe("watch");
  });

  it("BP above target edges", () => {
    const r = rules.bp;
    expect(bp(r.aboveTopAtLeast, 80)).toBe("watch");
    expect(bp(r.aboveTopAtLeast - 0.1, 80)).toBe("ok");
    expect(bp(120, r.aboveBottomAtLeast)).toBe("watch");
    expect(bp(120, r.aboveBottomAtLeast - 0.1)).toBe("ok");
  });

  it("BP low and implausible edges", () => {
    const r = rules.bp;
    expect(bp(r.lowTopBelow - 0.1, 70)).toBe("watch");
    expect(bp(r.lowTopBelow, 70)).toBe("ok");
    expect(bp(120, r.lowBottomBelow - 0.1)).toBe("watch");
    expect(checkReading({ kind: "bp", top: r.implausibleTopBelow - 0.1, bottom: 60 }).text).toMatch(
      /too low/,
    );
    expect(
      checkReading({ kind: "bp", top: 100, bottom: r.implausibleBottomBelow - 0.1 }).text,
    ).toMatch(/too low/);
  });

  it("sugar danger edges", () => {
    const r = rules.sugar;
    expect(sugar(r.dangerLowBelow - 0.1, "fasting")).toBe("danger");
    expect(sugar(r.dangerLowBelow, "fasting")).toBe("ok");
    expect(sugar(r.dangerHighAtLeast, "random")).toBe("danger");
    expect(sugar(r.dangerHighAtLeast - 0.1, "random")).toBe("watch");
    expect(checkReading({ kind: "sugar", value: 3.5, context: "fasting" }).selfCare).toBe(
      "Eat or drink something sweet now.",
    );
  });

  it.each(Object.entries(rules.sugar.targetMaxByContext))("sugar target for %s", (ctx, max) => {
    const c = ctx as "fasting";
    expect(sugar(max, c)).toBe("ok");
    expect(sugar(max + 0.1, c)).toBe("watch");
  });

  it("pulse edges", () => {
    const r = rules.pulse;
    expect(pulse(r.dangerBelow - 0.1)).toBe("danger");
    expect(pulse(r.dangerBelow)).toBe("watch");
    expect(pulse(r.dangerAbove + 0.1)).toBe("danger");
    expect(pulse(r.dangerAbove)).toBe("watch");
    expect(pulse(r.unusualBelow - 0.1)).toBe("watch");
    expect(pulse(r.unusualBelow)).toBe("ok");
    expect(pulse(r.unusualAbove + 0.1)).toBe("watch");
    expect(pulse(r.unusualAbove)).toBe("ok");
  });

  it("never mentions a dose", () => {
    const texts = [bp(190, 100), sugar(3, "fasting"), pulse(150)].join(" ");
    expect(texts).not.toMatch(/\bmg\b|tablet|units/i);
  });
});

/**
 * Blood pressure "Too low" (thresholds 0.3.0, pending CSO, researched 19 Nov 2026): a top number under
 * `dangerLowTopBelow` is a danger on the number alone. It sits between the typing check and "Low".
 */
describe('blood pressure "Too low"', () => {
  const r = rules.bp;
  const edge = r.dangerLowTopBelow;

  it("is a version 0.3.0 value, below Low and above the typing check", () => {
    expect(rules.version).toBe("0.3.0");
    expect(edge).toBeLessThan(r.lowTopBelow);
    expect(edge).toBeGreaterThan(r.implausibleTopBelow);
  });

  it("starts just under the edge and stops at it", () => {
    expect(bp(edge - 0.1, 60)).toBe("danger");
    expect(bp(edge, 60)).toBe("watch");
    expect(checkReading({ kind: "bp", top: edge, bottom: 60 }).text).toMatch(/^Low\./);
  });

  it("leaves the Low band as it was", () => {
    expect(bp(r.lowTopBelow - 0.1, 60)).toBe("watch");
    expect(bp(r.lowTopBelow, 60)).toBe("ok");
    // A low bottom number alone is still Low, never a danger: no source gives a bottom-number rule.
    expect(bp(120, r.lowBottomBelow - 0.1)).toBe("watch");
    expect(bp(edge + 5, r.implausibleBottomBelow)).toBe("watch");
  });

  it("leaves the typing check first", () => {
    const slip = checkReading({ kind: "bp", top: r.implausibleTopBelow - 0.1, bottom: 40 });
    expect(slip).toEqual({ level: "watch", text: "That looks too low. Check the number." });
    expect(bp(r.implausibleTopBelow, 40)).toBe("danger");
    // A bottom number that looks like a slip is checked before the top number is judged.
    expect(bp(edge - 5, r.implausibleBottomBelow - 0.1)).toBe("watch");
  });

  it("has its words, its signs and no self-care line", () => {
    expect(checkReading({ kind: "bp", top: edge - 4, bottom: 50 })).toEqual({
      level: "danger",
      text: "Too low",
      dangerWord: "Your blood pressure is too low.",
      signs: ["Dizzy or about to faint", "Confused", "Fast breathing"],
    });
  });

  it("is the critical tone with the same word in the trends", () => {
    expect(judge({ kind: "bp", top: edge - 4, bottom: 50 })).toEqual({
      tone: "critical",
      word: "Too low",
    });
    expect(judge({ kind: "bp", top: edge + 4, bottom: 50 })).toEqual({
      tone: "caution",
      word: "Low",
    });
  });

  it("changes nothing about sugar or high blood pressure", () => {
    expect(checkReading({ kind: "bp", top: r.dangerTopAtLeast, bottom: 80 })).toEqual({
      level: "danger",
      text: "Very high",
      dangerWord: "Your blood pressure is very high.",
      signs: ["Bad headache", "Chest pain", "Weak face, arm or speech"],
    });
    expect(
      checkReading({ kind: "sugar", value: rules.sugar.dangerLowBelow - 0.1, context: "fasting" }),
    ).toEqual({
      level: "danger",
      text: "Too low",
      dangerWord: "Your sugar is too low. Eat or drink something sweet now.",
      signs: ["Shaking or sweating", "Confused", "Very sleepy"],
      selfCare: "Eat or drink something sweet now.",
    });
    // Above "Low", blood pressure is judged as before.
    expect(bp(r.lowTopBelow, 60)).toBe("ok");
    expect(bp(r.aboveTopAtLeast, 80)).toBe("watch");
  });
});
