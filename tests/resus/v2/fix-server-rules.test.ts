import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { gcsTotal } from "@/lib/resus/disability";
import { HYPOTHERMIA_WITHHOLD_BELOW_C } from "@/lib/resus/reference/als-catalog";
import { allergyNoteIfChanged, buildAllergyNote, GcsSchema } from "@/lib/resus/v2-payloads";
import { fastPathHoldReason } from "@/lib/resus/v2-rules";
import {
  afterDeathTaskProblem,
  closeOutcomeProblem,
  priorDeathConfirmation,
} from "@/lib/resus/v2-rules-closeout";
import {
  amiodarone,
  assess,
  check,
  cpr,
  ctxOf,
  declare,
  ev,
  min,
  rosc,
  shock,
  started,
  stop,
  vital,
} from "./als/fixtures";

/**
 * Resus Desk v2 — server write rules added by the review fixes (PURE). Each
 * mirrors what the desk shows, so a stale or second device cannot write what
 * the console would not.
 */

const core = (atMs: number, coreTempC: number) =>
  assess(atMs, "E", { state: null, present: [], coreTempC, context: {} });

describe("D4 fast path follows the console's hypothermia modifiers", () => {
  const cold = [...started(), core(min(1), HYPOTHERMIA_WITHHOLD_BELOW_C - 2)];

  it("ALS-MOD-01: core < 30 °C withholds adrenaline, exactly when the console does", () => {
    const now = min(2);
    const console = computeArrestState(cold, now, ctxOf({ coreTempC: 28 }));
    expect(console.adrenaline.status).toBe("withheld");
    expect(fastPathHoldReason("adrenaline", cold, 0)).toBe("Adrenaline withheld — core < 30 °C");
  });

  it("ALS-MOD-01: at 30 °C, or with only a peripheral low reading (ALS-MOD-06), nothing is held", () => {
    const at30 = [...started(), core(min(1), HYPOTHERMIA_WITHHOLD_BELOW_C)];
    expect(fastPathHoldReason("adrenaline", at30, 0)).toBeNull();
    const peripheral = [...started(), vital(min(1), { temperature: 28 })];
    expect(fastPathHoldReason("adrenaline", peripheral, 0)).toBeNull();
    expect(fastPathHoldReason("adrenaline", started(), 0)).toBeNull();
  });

  it("ALS-MOD-03: amiodarone is the loading dose only — the second is delayed, as the console shows", () => {
    expect(fastPathHoldReason("amiodarone", cold, 0)).toBeNull();
    const vf = [
      ...cold,
      check(min(2), "vf_pvt"),
      ...[3, 5, 7, 9, 11].map((m) => shock(min(m))),
      amiodarone(min(8), 300),
      check(min(11.5), "vf_pvt"),
    ];
    const console = computeArrestState(vf, min(12), ctxOf({ coreTempC: 28 }));
    expect(console.antiarrhythmic.status).toBe("delayed_hypothermia");
    expect(fastPathHoldReason("amiodarone", vf, 1)).toBe("Antiarrhythmic delayed — hypothermia");
  });

  it("ALS-AA-04: lidocaine has no signed rule below 30 °C — the dialog, never the one tap", () => {
    expect(fastPathHoldReason("lidocaine", cold, 0)).toBe("Antiarrhythmic delayed — hypothermia");
    expect(fastPathHoldReason("lidocaine", started(), 0)).toBeNull();
  });
});

describe("one time of death per observation", () => {
  const confirmed = (atMs: number) => ev("death_confirmed", atMs, { confirmingName: "Dr A" });

  it("ALS-DTH-07: a confirmation after the latest stop refuses a second one", () => {
    const first = confirmed(min(26));
    expect(priorDeathConfirmation([...started(), stop(min(20)), first])?.id).toBe(first.id);
  });

  it("ALS-DTH-07: no confirmation yet, or one from an earlier observation, does not refuse", () => {
    expect(priorDeathConfirmation([...started(), stop(min(20))])).toBeNull();
    const restarted = [
      ...started(),
      stop(min(20)),
      confirmed(min(26)),
      declare(min(27)),
      cpr(min(27)),
      stop(min(40)),
    ];
    expect(priorDeathConfirmation(restarted)).toBeNull();
  });
});

describe("the close-out outcome matches a stop or a confirmed death", () => {
  it("LC-02: after a confirmed death only a death outcome closes (scenario A)", () => {
    const dead = [...started(), stop(min(20)), ev("death_confirmed", min(26), {})];
    expect(closeOutcomeProblem("stabilised", "ward", dead)).toMatch(/Death is confirmed/);
    expect(closeOutcomeProblem("transferred_out", "icu", dead)).toMatch(/Death is confirmed/);
    expect(closeOutcomeProblem("rosc_sustained", "icu", dead)).toMatch(/Death is confirmed/);
    expect(closeOutcomeProblem("died_after_cpr", "mortuary", dead)).toBeNull();
  });

  it("LC-02: a stop with no confirmation yet accepts no outcome but a confirmed death", () => {
    const stopped = [...started(), stop(min(20))];
    expect(closeOutcomeProblem("stabilised", "ward", stopped)).toMatch(/Resuscitation is stopped/);
    expect(closeOutcomeProblem("died_after_cpr", "mortuary", stopped)).toMatch(/Confirm death/);
  });

  it("CO-UTS-08: an earlier arrest's ROSC does not make a stopped re-arrest a ROSC (scenario B)", () => {
    const reArrest = [
      ...started(),
      rosc(min(10)),
      declare(min(40), 2),
      cpr(min(40), 2),
      stop(min(55), 2),
    ];
    expect(closeOutcomeProblem("rosc_sustained", "icu", reArrest)).toMatch(/stopped/);
  });

  it("CO-UTS-08: signs of life after the stop (ROSC) reopen the ROSC outcomes (ALS-DTH-05)", () => {
    const revived = [...started(), stop(min(20)), rosc(min(22))];
    expect(closeOutcomeProblem("rosc_sustained", "icu", revived)).toBeNull();
  });
});

describe("after-death tasks are the signed catalog's", () => {
  it("CO-ADT-01..10: every listed task is accepted", () => {
    for (let i = 1; i <= 10; i += 1)
      expect(afterDeathTaskProblem(`CO-ADT-${String(i).padStart(2, "0")}`)).toBeNull();
  });

  it("CO-ADT-11: organ donation is refused until a hospital setting enables it", () => {
    expect(afterDeathTaskProblem("CO-ADT-11")).toMatch(/Organ donation/);
  });

  it("CO-ADT: an id the catalog does not list is refused", () => {
    expect(afterDeathTaskProblem("CO-ADT-99")).toMatch(/Unknown/);
    expect(afterDeathTaskProblem("CO-BRD-03")).toMatch(/Unknown/);
  });
});

describe("AMPLE allergies carried forward are not written twice", () => {
  const note = (atMs: number, substances: string[], nkda = false) =>
    ev("note", atMs, buildAllergyNote(substances, nkda), null);

  it("the first capture, and a changed one, are written", () => {
    expect(allergyNoteIfChanged([], ["Penicillin"], false)?.label).toBe("Allergies: Penicillin");
    const had = [note(min(1), ["Penicillin"])];
    expect(allergyNoteIfChanged(had, ["Penicillin", "Latex"], false)).not.toBeNull();
    expect(allergyNoteIfChanged(had, [], true)?.label).toMatch(/NKDA/);
  });

  it("re-recording E with the same allergies (any order or case) writes nothing", () => {
    const had = [note(min(1), ["Penicillin", "Latex"])];
    expect(allergyNoteIfChanged(had, ["latex", "penicillin"], false)).toBeNull();
    expect(allergyNoteIfChanged([note(min(1), [], true)], [], true)).toBeNull();
  });

  it("compares with the LATEST capture, as prescribing reads it", () => {
    const history = [note(min(1), ["Penicillin"]), note(min(5), [], true)];
    expect(allergyNoteIfChanged(history, ["Penicillin"], false)).not.toBeNull();
    expect(allergyNoteIfChanged(history, [], false)).toBeNull();
  });
});

describe("GCS verbal T (intubated) is stored and scored as v1 does", () => {
  it("verbal T is verbal 1 + intubated, so gcsTotal scores it", () => {
    const g = GcsSchema.parse({ eye: 3, verbal: "T", motor: 5 });
    expect(g).toEqual({ eye: 3, verbal: 1, motor: 5, intubated: true });
    expect(gcsTotal({ eye: 3, verbal: 1, motor: 5, intubated: true })).toBe(9);
  });

  it("a numeric verbal is unchanged", () => {
    expect(GcsSchema.parse({ eye: 4, verbal: 5, motor: 6 })).toEqual({
      eye: 4,
      verbal: 5,
      motor: 6,
    });
  });
});
