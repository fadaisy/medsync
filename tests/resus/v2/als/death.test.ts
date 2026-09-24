import type { DeathConfirmedPayload } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import { deathChecklistComplete, deathObservation } from "@/lib/resus/death/confirmation";
import { DEATH_CHECKLIST, DEATH_CONFIRMATION_REFS } from "@/lib/resus/reference/death-confirmation";
import { check, decision, declare, ev, min, rosc, sec, started, stop } from "./fixtures";

/** Confirmation of death (catalog §10, ALS-DTH-01..09) — the 5-minute observation machine. */

const arrest = [...started(), check(min(2), "asystole")];
const all: DeathConfirmedPayload["criteria"] = {
  unconscious: true,
  apnoea: true,
  noCirculation: true,
  pupilsUnreactive: true,
  noMotorResponse: true,
  cornealReflexesAbsent: true,
};
const ref = (id: string) => DEATH_CONFIRMATION_REFS.find((e) => e.id === id)!;

describe("observation", () => {
  it("ALS-DTH-01: complete only after 5 minutes of observation", () => {
    const events = [...arrest, stop(min(30))];
    const early = deathObservation(events, min(35) - 1000);
    expect(early.complete).toBe(false);
    expect(early.remainingMs).toBe(1000);
    const done = deathObservation(events, min(35));
    expect(done.complete).toBe(true);
    expect(done.remainingMs).toBe(0);
    expect(done.elapsedMs).toBe(5 * 60_000);
  });

  it('ALS-DTH-02: the clock starts at "CPR stopped"', () => {
    expect(deathObservation([...arrest, stop(min(30))], min(31)).startedAtMs).toBe(min(30));
  });

  it("ALS-DTH-02: CPR not attempted starts the observation at that decision", () => {
    const events = [
      decision(sec(10), {
        decision: "cpr_not_attempted",
        reason: "irreversible_death",
        detail: "",
        label: "",
      }),
    ];
    const o = deathObservation(events, sec(10) + 5 * 60_000);
    expect(o.startedAtMs).toBe(sec(10));
    expect(o.complete).toBe(true);
  });

  it("ALS-DTH-01: no stop recorded → no observation, full 5:00 remaining", () => {
    const o = deathObservation(arrest, min(10));
    expect(o).toEqual({
      startedAtMs: null,
      invalidated: false,
      elapsedMs: 0,
      remainingMs: 300_000,
      complete: false,
      restarts: 0,
    });
  });

  it("ALS-DTH-05: a return of circulation after the stop invalidates — resume", () => {
    const o = deathObservation([...arrest, stop(min(30)), rosc(min(32))], min(40));
    expect(o.invalidated).toBe(true);
    expect(o.complete).toBe(false);
    expect(o.elapsedMs).toBe(0);
  });

  it("ALS-DTH-05: a new 5:00 runs from the next stop, counted as a restart", () => {
    const events = [...arrest, stop(min(30)), declare(min(31)), stop(min(40))];
    expect(deathObservation(events, min(44)).complete).toBe(false);
    const o = deathObservation(events, min(45));
    expect(o).toMatchObject({
      startedAtMs: min(40),
      invalidated: false,
      complete: true,
      restarts: 1,
    });
  });

  it("ALS-DTH-05: a corrected (superseded) stop does not start the clock", () => {
    const wrong = stop(min(30));
    const fix = { ...ev("note", min(30) + 1000, {}), supersedesEventId: wrong.id };
    expect(deathObservation([...arrest, wrong, fix], min(40)).startedAtMs).toBeNull();
  });
});

describe("checklist", () => {
  it("ALS-DTH-06: all criteria confirmed → complete", () => {
    expect(deathChecklistComplete(all)).toBe(true);
  });

  it("ALS-DTH-06: reactive pupils or a motor response → incomplete", () => {
    expect(deathChecklistComplete({ ...all, pupilsUnreactive: false })).toBe(false);
    expect(deathChecklistComplete({ ...all, noMotorResponse: false })).toBe(false);
  });

  it("ALS-DTH-06: corneal reflexes present block; not recorded is accepted", () => {
    expect(deathChecklistComplete({ ...all, cornealReflexesAbsent: false })).toBe(false);
    expect(deathChecklistComplete({ ...all, cornealReflexesAbsent: null })).toBe(true);
  });

  it("ALS-DTH-01: any of the three observed criteria missing → incomplete", () => {
    for (const k of ["unconscious", "apnoea", "noCirculation"] as const) {
      expect(deathChecklistComplete({ ...all, [k]: false })).toBe(false);
    }
  });

  it("ALS-DTH-07: the checklist covers every criterion of the record, in bedside order", () => {
    expect(DEATH_CHECKLIST.map((c) => c.key)).toEqual(Object.keys(all));
    expect(ref("ALS-DTH-07").text).toMatch(/confirming clinician is recorded/);
  });
});

describe("reference rows", () => {
  it("ALS-DTH-03: the ventilator is disconnected before observation starts", () => {
    expect(ref("ALS-DTH-03").text).toMatch(/disconnected from the ventilator/);
    expect(ref("ALS-DTH-03").status).toBe("signed");
  });

  it("ALS-DTH-04: supporting monitoring (ECG, arterial trace, echo)", () => {
    expect(ref("ALS-DTH-04").url).toMatch(/aomrc\.org\.uk/);
  });

  it("ALS-DTH-08: the family is told the time may differ", () => {
    expect(ref("ALS-DTH-08").text).toMatch(/may differ/);
  });

  it("ALS-DTH-09: legal questions are left as configured tasks (design / CSO-legal)", () => {
    expect(ref("ALS-DTH-09").confidence).toBe("design");
    expect(ref("ALS-DTH-01").value).toBe("5:00");
  });
});
