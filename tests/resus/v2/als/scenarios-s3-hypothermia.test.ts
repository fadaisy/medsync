import type { ArrestContext } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { tMs } from "@/lib/resus/als/timing";
import { adrenaline, amiodarone, check, ctxOf, MIN, min, sec, shock, started } from "./fixtures";

/**
 * Scenario S3 — hypothermic VF, on a fake clock (catalog §7, ALS-MOD-01..06).
 * Core 28 °C: adrenaline withheld; after 3 shocks further shocks delayed; amiodarone
 * loading dose only. Rewarmed to core 30 °C: adrenaline due, then every 6–10 min while
 * 30–35 °C; above 30 °C shocks and the second amiodarone dose resume. A peripheral-only
 * reading < 32 °C never withholds — it prompts a core measurement (ALS-MOD-06).
 * The temperature is a context snapshot, so each clock time is viewed at its temperature.
 */

const core = (coreTempC: number) => ctxOf({ coreTempC });
const script = [
  ...started(),
  check(sec(10), "vf_pvt"),
  shock(sec(15)),
  check(sec(135), "vf_pvt"),
  shock(sec(140)),
  check(sec(260), "vf_pvt"),
  shock(sec(265)),
  amiodarone(sec(275), 300),
];
/** Shocks 4 and 5 — recorded anyway: the console advises, it never blocks. */
const fiveShocks = [
  ...script,
  check(sec(385), "vf_pvt"),
  shock(sec(390)),
  check(sec(510), "vf_pvt"),
  shock(sec(515)),
];
const upTo = (s: number) => script.filter((e) => tMs(e) <= sec(s));
const at = (s: number, ctx: ArrestContext, nowMs = sec(s)) =>
  computeArrestState(upTo(s), nowMs, ctx);
const promptOf = (s: ReturnType<typeof at>, id: string) => s.prompts.find((p) => p.id === id);

describe("S3: hypothermic VF (core 28 °C → 30 °C) and the peripheral-only reading", () => {
  it("S3: core 28 °C — adrenaline withheld from the first shock through the 3rd (ALS-MOD-01)", () => {
    for (const s of [at(15, core(28)), at(265, core(28))]) {
      expect(s.adrenaline).toMatchObject({
        status: "withheld",
        opensAtMs: null,
        ruleIds: ["ALS-MOD-01"],
      });
      expect(promptOf(s, "adrenaline")).toMatchObject({ ruleId: "ALS-MOD-01", severity: "info" });
      expect(s.modifiers.map((m) => m.id)).toContain("hypothermia_below_30");
    }
  });

  it("S3: core 28 °C — shocks are delayed only after the 3rd shock (ALS-MOD-02)", () => {
    expect(at(140, core(28)).shocks).toMatchObject({ count: 2, delayed: false });
    const s = at(265, core(28));
    expect(s.shocks).toMatchObject({ count: 3, delayed: true });
    expect(promptOf(s, "shocks_delayed")?.ruleId).toBe("ALS-MOD-02");
  });

  it("S3: core 28 °C — amiodarone 300 loading dose allowed at 3 shocks (ALS-MOD-03)", () => {
    const s = at(265, core(28));
    expect(s.antiarrhythmic).toMatchObject({ status: "due", nextDoseMg: 300 });
    expect(s.antiarrhythmic.ruleIds).toEqual(["ALS-AA-01", "ALS-AA-04", "ALS-MOD-03"]);
    expect(s.antiarrhythmic.reason).toMatch(/loading dose/);
    expect(at(275, core(28)).antiarrhythmic).toMatchObject({ dosesGiven: 1, nextDoseMg: null });
  });

  it("S3: core 28 °C — the second amiodarone dose is delayed_hypothermia at 5 shocks", () => {
    const s = computeArrestState(fiveShocks, sec(520), core(28));
    expect(s.antiarrhythmic).toMatchObject({
      status: "delayed_hypothermia",
      dosesGiven: 1,
      nextDoseMg: null,
      ruleIds: ["ALS-MOD-03"],
    });
    expect(promptOf(s, "antiarrhythmic")).toMatchObject({ ruleId: "ALS-MOD-03", severity: "info" });
  });

  it("S3: rewarmed to core 30 °C — adrenaline due now (after the 3rd shock)", () => {
    const s = at(275, core(30), min(10));
    expect(s.adrenaline.status).toBe("due_now");
    expect(s.adrenaline.ruleIds).toContain("ALS-ADR-01");
    expect(s.modifiers.map((m) => m.id)).toContain("hypothermia_30_to_35");
  });

  it("S3: core 30–35 °C — the adrenaline interval is 6–10 min (ALS-MOD-04)", () => {
    const given = min(10);
    const events = [...script, adrenaline(given)];
    for (const temp of [30, 33, 35]) {
      const view = (nowMs: number) => computeArrestState(events, nowMs, core(temp)).adrenaline;
      expect(view(given)).toMatchObject({
        status: "waiting",
        opensAtMs: given + 6 * MIN,
        overdueAtMs: given + 10 * MIN,
      });
      expect(view(given).ruleIds).toContain("ALS-MOD-04");
      expect(view(given).reason).toMatch(/6–10 min/);
      expect(view(given + 6 * MIN - 1).status).toBe("waiting");
      expect(view(given + 6 * MIN).status).toBe("window_open");
      expect(view(given + 10 * MIN).status).toBe("window_open");
      expect(view(given + 10 * MIN + 1).status).toBe("overdue");
    }
    const warm = computeArrestState(events, given, core(36)).adrenaline;
    expect(warm).toMatchObject({ opensAtMs: given + 3 * MIN, overdueAtMs: given + 5 * MIN });
  });

  it("S3: above 30 °C shocks are no longer delayed and the 150 mg dose is due at 5 shocks", () => {
    expect(at(265, core(31)).shocks).toMatchObject({ count: 3, delayed: false });
    expect(promptOf(at(265, core(31)), "shocks_delayed")).toBeUndefined();
    const s = computeArrestState(fiveShocks, sec(520), core(31));
    expect(s.shocks.delayed).toBe(false);
    expect(s.antiarrhythmic).toMatchObject({ status: "due", nextDoseMg: 150 });
  });

  it("S3: peripheral-only 31 °C (core unknown) — NOT withheld; measure core (ALS-MOD-06)", () => {
    const ctx = ctxOf({ coreTempC: null, otherTempC: 31 });
    const s = at(265, ctx);
    expect(s.adrenaline.status).toBe("due_now");
    expect(s.adrenaline.ruleIds).toEqual(expect.arrayContaining(["ALS-ADR-01", "ALS-MOD-06"]));
    expect(s.shocks).toMatchObject({ count: 3, delayed: false });
    expect(s.antiarrhythmic).toMatchObject({ status: "due", nextDoseMg: 300 });
    expect(s.antiarrhythmic.ruleIds).not.toContain("ALS-MOD-03");
    expect(promptOf(s, "core_temp")).toMatchObject({ ruleId: "ALS-MOD-06", severity: "due" });
    expect(s.modifiers.map((m) => m.id)).toEqual(["temperature_not_core"]);
    const given = sec(280);
    const after = computeArrestState([...script, adrenaline(given)], given, ctx).adrenaline;
    expect(after).toMatchObject({ opensAtMs: given + 3 * MIN, overdueAtMs: given + 5 * MIN });
  });
});
