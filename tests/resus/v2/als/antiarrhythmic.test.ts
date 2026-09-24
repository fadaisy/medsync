import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { amiodarone, check, ctxOf, lidocaine, rosc, sec, shock, started } from "./fixtures";

/** ALS engine — antiarrhythmic eligibility (ALS-AA-01..04, ALS-MOD-03, ALS-MOD-16). */

/** n VF cycles: check at 2-min marks, shock 5 s later. */
const vf = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => {
    const t = sec(120 * (from + i + 1));
    return [check(t, "vf_pvt"), shock(t + 5000)];
  }).flat();
const aa = (events: Parameters<typeof computeArrestState>[0], nowMs: number, ctx = ctxOf()) =>
  computeArrestState(events, nowMs, ctx).antiarrhythmic;

describe("amiodarone (default)", () => {
  it("ALS-AA-01: amiodarone 300 mg is due after a total of 3 shocks in VF", () => {
    const s = computeArrestState([...started(), ...vf(3)], sec(380), ctxOf());
    expect(s.antiarrhythmic.drug).toBe("amiodarone");
    expect(s.antiarrhythmic.status).toBe("due");
    expect(s.antiarrhythmic.nextDoseMg).toBe(300);
    expect(s.antiarrhythmic.ruleIds[0]).toBe("ALS-AA-01");
    expect(s.prompts.find((p) => p.id === "antiarrhythmic")?.text).toMatch(/300 mg/);
  });

  it("ALS-AA-01: not due after 3 shocks if the current rhythm is no longer VF", () => {
    const a = aa([...started(), ...vf(3), check(sec(480), "pea")], sec(485));
    expect(a.status).toBe("not_eligible");
    expect(a.nextDoseMg).toBeNull();
  });

  it("ALS-AA-04: before the 3rd shock nothing is shown (no dose number)", () => {
    const a = aa([...started(), ...vf(2)], sec(260));
    expect(a.status).toBe("not_eligible");
    expect(a.nextDoseMg).toBeNull();
  });

  it("ALS-AA-02: after 300 mg, the 150 mg dose waits for the 5th shock", () => {
    const events = [...started(), ...vf(3), amiodarone(sec(380), 300), ...vf(1, 3)];
    const a = aa(events, sec(500));
    expect(a.dosesGiven).toBe(1);
    expect(a.status).toBe("not_eligible");
    expect(a.nextDoseMg).toBeNull();
  });

  it("ALS-AA-02: amiodarone 150 mg is due after a total of 5 shocks", () => {
    const events = [...started(), ...vf(3), amiodarone(sec(380), 300), ...vf(2, 3)];
    const a = aa(events, sec(610));
    expect(a.status).toBe("due");
    expect(a.nextDoseMg).toBe(150);
    expect(a.ruleIds[0]).toBe("ALS-AA-02");
  });

  it("ALS-AA-02: two doses given → complete, no further number", () => {
    const events = [
      ...started(),
      ...vf(3),
      amiodarone(sec(380), 300),
      ...vf(2, 3),
      amiodarone(sec(610), 150),
    ];
    const a = aa(events, sec(620));
    expect(a.status).toBe("complete");
    expect(a.nextDoseMg).toBeNull();
  });

  it("ALS-AA-01: after ROSC the antiarrhythmic is not eligible", () => {
    expect(aa([...started(), ...vf(3), rosc(sec(400))], sec(420)).status).toBe("not_eligible");
  });
});

describe("lidocaine (hospital choice)", () => {
  it("ALS-AA-03: lidocaine 100 mg after 3 shocks", () => {
    const a = aa([...started(), ...vf(3)], sec(380), ctxOf({ antiarrhythmic: "lidocaine" }));
    expect(a.drug).toBe("lidocaine");
    expect(a.nextDoseMg).toBe(100);
    expect(a.ruleIds[0]).toBe("ALS-AA-03");
  });

  it("ALS-AA-03: lidocaine 50 mg after 5 shocks", () => {
    const events = [...started(), ...vf(3), lidocaine(sec(380), 100), ...vf(2, 3)];
    const a = aa(events, sec(610), ctxOf({ antiarrhythmic: "lidocaine" }));
    expect(a.status).toBe("due");
    expect(a.nextDoseMg).toBe(50);
  });

  it("ALS-AA-04: one antiarrhythmic per arrest — a lidocaine dose is tracked even if amiodarone is the default", () => {
    const events = [...started(), ...vf(3), lidocaine(sec(380), 100), ...vf(2, 3)];
    const a = aa(events, sec(610));
    expect(a.drug).toBe("lidocaine");
    expect(a.dosesGiven).toBe(1);
    expect(a.nextDoseMg).toBe(50);
  });
});

describe("modifiers on the antiarrhythmic", () => {
  it("ALS-MOD-03: core < 30 °C — the 300 mg loading dose is allowed at the after-3-shocks point", () => {
    const a = aa([...started(), ...vf(3)], sec(380), ctxOf({ coreTempC: 28 }));
    expect(a.status).toBe("due");
    expect(a.nextDoseMg).toBe(300);
    expect(a.ruleIds).toContain("ALS-MOD-03");
  });

  it("ALS-MOD-03: core < 30 °C — further doses are delayed until core > 30 °C", () => {
    const events = [...started(), ...vf(3), amiodarone(sec(380), 300), ...vf(2, 3)];
    const s = computeArrestState(events, sec(610), ctxOf({ coreTempC: 28 }));
    expect(s.antiarrhythmic.status).toBe("delayed_hypothermia");
    expect(s.antiarrhythmic.nextDoseMg).toBeNull();
    expect(s.prompts.find((p) => p.id === "antiarrhythmic")?.ruleId).toBe("ALS-MOD-03");
  });

  it("ALS-MOD-03: amiodarone only — lidocaine below 30 °C shows no dose and no MOD-03 tag", () => {
    const lido = ctxOf({ coreTempC: 28, antiarrhythmic: "lidocaine" });
    const s = computeArrestState([...started(), ...vf(3)], sec(380), lido);
    expect(s.antiarrhythmic.nextDoseMg).toBeNull();
    expect(s.antiarrhythmic.ruleIds).not.toContain("ALS-MOD-03");
    const p = s.prompts.find((x) => x.id === "antiarrhythmic");
    expect(p?.ruleId).not.toBe("ALS-MOD-03");
    expect(p?.text).not.toMatch(/\d+ mg/);
    const second = [...started(), ...vf(3), lidocaine(sec(380), 100), ...vf(2, 3)];
    const a2 = aa(second, sec(610), lido);
    expect(a2.nextDoseMg).toBeNull();
    expect(a2.ruleIds).not.toContain("ALS-MOD-03");
  });

  it("ALS-MOD-10: local anaesthetic toxicity — no lidocaine dose is prompted (catalog gap)", () => {
    const last = ctxOf({ antiarrhythmic: "lidocaine" }, { localAnaestheticToxicity: true });
    const s = computeArrestState([...started(), ...vf(3)], sec(380), last);
    expect(s.antiarrhythmic.status).not.toBe("due");
    expect(s.antiarrhythmic.nextDoseMg).toBeNull();
    expect(s.prompts.some((x) => x.id === "antiarrhythmic")).toBe(false);
    // Amiodarone is unaffected by LAST.
    const amio = aa(
      [...started(), ...vf(3)],
      sec(380),
      ctxOf({}, { localAnaestheticToxicity: true }),
    );
    expect(amio.nextDoseMg).toBe(300);
  });

  it("ALS-MOD-16: a child gets no antiarrhythmic dose", () => {
    const a = aa([...started(), ...vf(3)], sec(380), ctxOf({ ageYears: 12 }));
    expect(a.status).toBe("suppressed_child");
    expect(a.nextDoseMg).toBeNull();
  });
});
