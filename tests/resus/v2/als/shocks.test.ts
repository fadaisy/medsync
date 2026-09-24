import type { BayProfile } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { check, ctxOf, declare, min, rosc, sec, shock, started } from "./fixtures";

/** ALS engine — rhythms, shocks and energy (catalog §3, ALS-SHK / ALS-NRG / ALS-RHY). */

const profile = (energySequenceJ: number[] | null): BayProfile => ({
  id: "bay-2",
  label: "Bay 2 · biphasic RLB",
  waveform: "rectilinear_biphasic",
  energySequenceJ,
  capnography: true,
  ultrasound: false,
  mechanicalCpr: false,
  ecpr: false,
});
const vfShocks = (n: number) =>
  Array.from({ length: n }, (_, i) => [
    check(sec(120 * (i + 1)), "vf_pvt"),
    shock(sec(120 * (i + 1) + 5)),
  ]).flat();

describe("shocks", () => {
  it("ALS-SHK-01: a shock is counted as soon as it is recorded, with its time", () => {
    const s = computeArrestState([...started(), shock(sec(20))], sec(30), ctxOf());
    expect(s.shocks.count).toBe(1);
    expect(s.shocks.lastAtMs).toBe(sec(20));
  });

  it("ALS-SHK-02: shocks keep counting across intermittent ROSC within one arrest", () => {
    const events = [
      ...started(),
      ...vfShocks(2),
      rosc(min(6)),
      declare(min(9)),
      shock(min(9) + 5000),
    ];
    expect(computeArrestState(events, min(10), ctxOf()).shocks.count).toBe(3);
  });

  it("ALS-SHK-03: three stacked shocks count as shock 1", () => {
    const events = [
      ...started(),
      shock(sec(5), 1, true),
      shock(sec(15), 1, true),
      shock(sec(25), 1, true),
    ];
    const s = computeArrestState(events, sec(30), ctxOf());
    expect(s.shocks.count).toBe(1);
    expect(s.shocks.lastAtMs).toBe(sec(25));
  });

  it("ALS-SHK-03: a stack is at most 3 — a 4th stacked shock counts as a new shock", () => {
    const stack = [5, 15, 25, 35].map((t) => shock(sec(t), 1, true));
    expect(computeArrestState([...started(), ...stack], sec(40), ctxOf()).shocks.count).toBe(2);
  });

  it("ALS-SHK-03: a stack then standard shocks counts 1 + each standard shock", () => {
    const events = [...started(), shock(sec(5), 1, true), shock(sec(15), 1, true), ...vfShocks(2)];
    expect(computeArrestState(events, sec(300), ctxOf()).shocks.count).toBe(3);
  });

  it("ALS-SHK-04: VF after 3 consecutive shocks is refractory — antero-posterior pads prompt", () => {
    const s = computeArrestState(
      [...started(), ...vfShocks(3), check(sec(480), "vf_pvt")],
      sec(490),
      ctxOf(),
    );
    expect(s.shocks.consecutive).toBe(3);
    expect(s.shocks.refractoryVf).toBe(true);
    const p = s.prompts.find((x) => x.ruleId === "ALS-SHK-04");
    expect(p?.text).toMatch(/antero-posterior/);
  });

  it("ALS-SHK-04: a non-VF rhythm check resets the consecutive count", () => {
    const events = [
      ...started(),
      ...vfShocks(2),
      check(sec(360), "pea"),
      ...[check(sec(480), "vf_pvt"), shock(sec(485))],
    ];
    const s = computeArrestState(events, sec(490), ctxOf());
    expect(s.shocks.count).toBe(3);
    expect(s.shocks.consecutive).toBe(1);
    expect(s.shocks.refractoryVf).toBe(false);
  });

  it("ALS-SHK-04: not refractory once the current rhythm is no longer VF", () => {
    const s = computeArrestState(
      [...started(), ...vfShocks(3), check(sec(480), "asystole")],
      sec(490),
      ctxOf(),
    );
    expect(s.shocks.refractoryVf).toBe(false);
  });

  it("ALS-SHK-05: dual sequential defibrillation is never offered", () => {
    const s = computeArrestState(
      [...started(), ...vfShocks(5), check(sec(720), "vf_pvt")],
      sec(730),
      ctxOf(),
    );
    const text = s.prompts.map((p) => p.text).join(" ");
    expect(text).not.toMatch(/dual|sequential|DSD/i);
  });
});

describe("energy", () => {
  it("ALS-NRG-01: the registered profile gives the next shock's energy from its sequence", () => {
    const ctx = ctxOf({ bayProfile: profile([150, 200, 250]) });
    const first = computeArrestState(started(), sec(5), ctx).shocks.energy;
    expect(first).toEqual({ kind: "profile", joules: 150, profileLabel: "Bay 2 · biphasic RLB" });
    const second = computeArrestState([...started(), shock(sec(10))], sec(15), ctx).shocks.energy;
    expect(second).toMatchObject({ kind: "profile", joules: 200 });
  });

  it("ALS-NRG-01: past the end of the sequence the last step repeats", () => {
    const ctx = ctxOf({ bayProfile: profile([150, 200]) });
    const s = computeArrestState([...started(), ...vfShocks(4)], sec(600), ctx);
    expect(s.shocks.energy).toMatchObject({ kind: "profile", joules: 200 });
  });

  it('ALS-NRG-02: no profile → "highest available setting", no joule number', () => {
    const s = computeArrestState(started(), sec(5), ctxOf());
    expect(s.shocks.energy).toEqual({ kind: "highest" });
    expect(JSON.stringify(s.shocks.energy)).not.toMatch(/\d/);
  });

  it("ALS-NRG-02: a profile without a sequence (null or empty) also gives highest setting", () => {
    expect(
      computeArrestState(started(), sec(5), ctxOf({ bayProfile: profile(null) })).shocks.energy,
    ).toEqual({ kind: "highest" });
    expect(
      computeArrestState(started(), sec(5), ctxOf({ bayProfile: profile([]) })).shocks.energy,
    ).toEqual({ kind: "highest" });
  });

  it("ALS-NRG-04: obesity keeps the standard energy and adds the standard-ALS modifier", () => {
    const ctx = ctxOf({ bayProfile: profile([150]) }, { bmiOver40: true });
    const s = computeArrestState(started(), sec(5), ctx);
    expect(s.shocks.energy).toMatchObject({ joules: 150 });
    expect(s.modifiers.find((m) => m.id === "obesity")?.ruleIds).toContain("ALS-NRG-04");
  });

  it("ALS-MOD-16: a child never gets an energy, even with a registered profile", () => {
    const ctx = ctxOf({ ageYears: 9, bayProfile: profile([150, 200]) });
    expect(computeArrestState([...started(), shock(sec(10))], sec(20), ctx).shocks.energy).toEqual({
      kind: "suppressed_child",
    });
  });

  it("ALS-MOD-02: core < 30 °C after 3 shocks — further shocks delayed", () => {
    const cold = ctxOf({ coreTempC: 28 });
    expect(computeArrestState([...started(), ...vfShocks(2)], sec(300), cold).shocks.delayed).toBe(
      false,
    );
    const s = computeArrestState([...started(), ...vfShocks(3)], sec(400), cold);
    expect(s.shocks.delayed).toBe(true);
    expect(s.prompts.some((p) => p.ruleId === "ALS-MOD-02")).toBe(true);
  });

  it("ALS-MOD-02: shocks resume once core is 30 °C or above", () => {
    const s = computeArrestState(
      [...started(), ...vfShocks(3)],
      sec(400),
      ctxOf({ coreTempC: 30 }),
    );
    expect(s.shocks.delayed).toBe(false);
  });

  it("ALS-MOD-06: a low peripheral temperature never delays shocks", () => {
    const s = computeArrestState(
      [...started(), ...vfShocks(3)],
      sec(400),
      ctxOf({ otherTempC: 27 }),
    );
    expect(s.shocks.delayed).toBe(false);
  });
});

describe("rhythms", () => {
  it("ALS-RHY-01: asystole prompts a check of the ECG for P waves", () => {
    const s = computeArrestState([...started(), check(sec(120), "asystole")], sec(125), ctxOf());
    expect(s.prompts.find((p) => p.ruleId === "ALS-RHY-01")?.text).toMatch(/P waves/);
  });

  it("ALS-RHY-02: organised rhythm without a pulse is recorded as PEA", () => {
    const s = computeArrestState(
      [...started(), check(sec(120), "organised", 1, false)],
      sec(125),
      ctxOf(),
    );
    expect(s.currentRhythm).toBe("pea");
    expect(s.adrenaline.status).toBe("due_now");
  });

  it('ALS-RHY-02: organised rhythm with the pulse unknown prompts "Pulse?"', () => {
    const s = computeArrestState(
      [...started(), check(sec(120), "organised", 1, null)],
      sec(125),
      ctxOf(),
    );
    expect(s.currentRhythm).toBe("organised");
    expect(s.prompts.find((p) => p.ruleId === "ALS-RHY-02")?.severity).toBe("due");
  });

  it("ALS-RHY-03: the first rhythm check stays the first rhythm; the latest is current", () => {
    const events = [
      ...started(),
      check(sec(120), "vf_pvt"),
      shock(sec(125)),
      check(sec(245), "pea"),
    ];
    const s = computeArrestState(events, sec(250), ctxOf());
    expect(s.firstRhythm).toBe("vf_pvt");
    expect(s.currentRhythm).toBe("pea");
    expect(s.rhythms).toEqual([
      { atMs: sec(120), rhythm: "vf_pvt" },
      { atMs: sec(245), rhythm: "pea" },
    ]);
  });
});
