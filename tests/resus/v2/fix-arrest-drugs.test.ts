import { describe, expect, it } from "vitest";

import {
  adrenalineButton,
  antiarrhythmicButton,
  episodeTotalsLine,
  keepUnit,
} from "@/app/nurse/resus/[episodeId]/_components/v2/arrest-console-drugs";
import { undoStep } from "@/app/nurse/resus/[episodeId]/_components/v2/arrest-console-model";
import { computeArrestState } from "@/lib/resus/als/engine";
import {
  adrenaline,
  amiodarone,
  assess,
  check,
  cpr,
  ctxOf,
  declare,
  MIN,
  rosc,
  sec,
  shock,
  started,
} from "./als/fixtures";

/** The arrest console's drug buttons and queued Undo (fixer group "arrest"). */

const NB = "\u00a0";
/** n VF checks + shocks, one per 2-min cycle from `fromMs` (default the arrest at T0). */
const vfShocks = (n: number, seq = 1, fromMs = sec(0)) =>
  Array.from({ length: n }, (_, i) => [
    check(fromMs + (10 + i * 125) * 1000, "vf_pvt", seq),
    shock(fromMs + (15 + i * 125) * 1000, seq),
  ]).flat();

describe("D4 fast path: a withheld or delayed drug opens the dialog, never one tap", () => {
  const cold = ctxOf({ coreTempC: 28 });

  it("ALS-MOD-01: adrenaline withheld (core < 30 °C) has no one-tap dose and says why", () => {
    const s = computeArrestState([...started(), ...vfShocks(3)], sec(270), cold);
    expect(s.adrenaline.status).toBe("withheld");
    const b = adrenalineButton(s, cold, sec(270), "iv");
    expect(b).toMatchObject({ doseMg: null, label: "Adrenaline", reasons: [s.adrenaline.reason] });
    expect(b.caption).toMatch(/^Withheld — hypothermia/);
  });

  it("ALS-MOD-03: the delayed second amiodarone dose opens the dialog with the reason", () => {
    const events = [
      ...started(),
      ...vfShocks(3),
      amiodarone(sec(275), 300),
      ...vfShocks(2, 1, sec(375)),
    ];
    const s = computeArrestState(events, sec(700), cold);
    expect(s.antiarrhythmic.status).toBe("delayed_hypothermia");
    const b = antiarrhythmicButton(s, cold);
    expect(b).toMatchObject({
      doseMg: null,
      label: "Amiodarone",
      reasons: [s.antiarrhythmic.reason],
    });
  });

  it("S1: the one tap follows the server's hold — lidocaine below 30 °C, even before shock 3", () => {
    const ctx = ctxOf({ antiarrhythmic: "lidocaine", coreTempC: 28 });
    const core = assess(sec(5), "E", { state: null, present: [], coreTempC: 28, context: {} });
    const events = [...started(), core, ...vfShocks(2)];
    const s = computeArrestState(events, sec(260), ctx);
    expect(antiarrhythmicButton(s, ctx).doseMg).not.toBeNull();
    const b = antiarrhythmicButton(s, ctx, events);
    expect(b.doseMg).toBeNull();
    expect(b.reasons).toEqual(["Antiarrhythmic delayed — hypothermia"]);
  });

  it("ALS-MOD-10: in LAST neither adrenaline nor lidocaine is one tap; the LAST label is the reason", () => {
    const ctx = ctxOf({ antiarrhythmic: "lidocaine" }, { localAnaestheticToxicity: true });
    const s = computeArrestState([...started(), ...vfShocks(3)], sec(270), ctx);
    const last = s.modifiers.find((m) => m.id === "last")?.label;
    expect(last).toBeTruthy();
    expect(adrenalineButton(s, ctx, sec(270), "iv")).toMatchObject({
      doseMg: null,
      reasons: [last],
    });
    expect(antiarrhythmicButton(s, ctx)).toMatchObject({ doseMg: null, reasons: [last] });
  });

  it("ALS-ADR-01 / ALS-AA-01: a clear adult arrest keeps the one tap, number and unit joined", () => {
    const ctx = ctxOf();
    const s = computeArrestState([...started(), ...vfShocks(3)], sec(270), ctx);
    const adr = adrenalineButton(s, ctx, sec(270), "iv");
    expect(adr.doseMg).not.toBeNull();
    expect(adr.label).toMatch(new RegExp(`\\d${NB}mg`));
    const aa = antiarrhythmicButton(s, ctx);
    expect(aa.doseMg).not.toBeNull();
    expect(aa.label).toBe(`Amiodarone ${aa.doseMg}${NB}mg`);
    expect(aa.reasons).toEqual([]);
  });

  it("ALS-MOD-16: a child sees no number on either button", () => {
    const ctx = ctxOf({ ageYears: 8 });
    const s = computeArrestState([...started(), ...vfShocks(3)], sec(270), ctx);
    expect(adrenalineButton(s, ctx, sec(270), "iv")).toMatchObject({
      doseMg: null,
      label: "Adrenaline",
    });
    expect(antiarrhythmicButton(s, ctx).label).toBe("Amiodarone");
  });
});

describe("ALS-ROSC-05: episode drug totals stay visible in a re-arrest (S4b)", () => {
  const ctx = ctxOf();
  const ROSC_AT = sec(700);
  const arrest1 = [
    ...started(),
    ...vfShocks(3),
    adrenaline(sec(270)),
    amiodarone(sec(275), 300),
    ...vfShocks(2, 1, sec(375)),
    adrenaline(sec(520)),
    amiodarone(sec(525), 150),
    check(sec(690), "organised", 1, true),
    rosc(ROSC_AT),
  ];
  const RE = ROSC_AT + 30 * MIN;
  const arrest2 = [...arrest1, declare(RE, 2), cpr(RE, 2), ...vfShocks(3, 2, RE)];

  it("S4b: arrest 1 shows no episode line (nothing earlier to add)", () => {
    expect(episodeTotalsLine(computeArrestState(arrest1, sec(530), ctx))).toBeNull();
  });

  it("S4b: arrest 2 offers amiodarone again but says 450 mg were given in this resus", () => {
    const now = RE + 380_000;
    const s = computeArrestState(arrest2, now, ctx);
    expect(s.arrestSeq).toBe(2);
    const aa = antiarrhythmicButton(s, ctx);
    expect(aa.show).toBe(true);
    expect(aa.caption).toContain(`450${NB}mg this resus`);
    const adr = adrenalineButton(s, ctx, now, "iv");
    expect(adr.caption).toContain(`2${NB}mg this resus`);
    expect(episodeTotalsLine(s)).toBe(
      `This resus, all arrests: Adrenaline 2${NB}mg · Amiodarone 450${NB}mg`,
    );
  });
});

describe("R1: a queued Undo never holds the write queue", () => {
  it("corrects a landed entry", () => {
    expect(undoStep(true, true, undefined)).toBe("correct");
  });
  it("waits while the entry is queued, sending, or accepted but not yet fetched", () => {
    expect(undoStep(false, false, "pending")).toBe("wait");
    expect(undoStep(false, false, "sending")).toBe("wait");
    expect(undoStep(false, true, undefined)).toBe("wait");
  });
  it("drops the correction when the entry was never recorded (failed, blocked, discarded)", () => {
    expect(undoStep(false, false, "failed")).toBe("drop");
    expect(undoStep(false, false, undefined)).toBe("drop");
  });
});

describe("R9: a clinical number never leaves its unit", () => {
  it("joins mg, J and kPa to their numbers with a no-break space", () => {
    expect(keepUnit("Adrenaline 1 mg IV · Shock 200 J · EtCO₂ 2.4 kPa")).toBe(
      `Adrenaline 1${NB}mg IV · Shock 200${NB}J · EtCO₂ 2.4${NB}kPa`,
    );
  });
});
