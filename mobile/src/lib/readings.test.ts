import rules from "@clinical-rules/patient-thresholds.v0.json";

import { checkReading } from "@/lib/readings";

const bp = (top: number, bottom: number) => checkReading({ kind: "bp", top, bottom }).level;
const sugar = (value: number, context: "fasting" | "lunch" | "supper" | "after" | "bedtime" | "random") =>
  checkReading({ kind: "sugar", value, context }).level;
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
    expect(checkReading({ kind: "bp", top: r.implausibleTopBelow - 0.1, bottom: 60 }).text).toMatch(/too low/);
    expect(checkReading({ kind: "bp", top: 100, bottom: r.implausibleBottomBelow - 0.1 }).text).toMatch(/too low/);
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
