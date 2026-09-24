import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { projectArrestRecord } from "@/lib/resus/utstein/project";
import {
  adrenaline,
  check,
  cpr,
  decision,
  declare,
  drug,
  ev,
  min,
  proc,
  rosc,
  sec,
  shock,
  started,
  stop,
  T0,
} from "./fixtures";

/** Utstein IHCA core data — the per-arrest record (closeout catalog §7, CO-UTS-01..09). */

const iso = (ms: number) => new Date(ms).toISOString();
const record = (events: TimelineEvent[], nowMs = min(60), seq = 1) =>
  projectArrestRecord(events, seq, nowMs);
/** A correction row: a new event that supersedes `of` (the original leaves the view). */
const correcting = (of: TimelineEvent, e: TimelineEvent): TimelineEvent => ({
  ...e,
  supersedesEventId: of.id,
});
const limitation = (atMs: number) =>
  decision(atMs, { decision: "treatment_limitation", summary: "Not for CPR", label: "" });

describe("Utstein record — arrest details (CO-UTS-01/02)", () => {
  it("CO-UTS-01: witnessed and monitored stay null (unknown) until recorded", () => {
    const r = record(started());
    expect(r.arrestSeq).toBe(1);
    expect(r.witnessed).toBeNull();
    expect(r.monitored).toBeNull();
  });

  it("CO-UTS-01: details recorded after CPR supersede the declaration; the original leaves the view", () => {
    const original = declare(T0, 1, { witnessed: null, monitored: null });
    const details = correcting(
      original,
      declare(T0, 1, { witnessed: true, monitored: false, collapseAtIso: iso(sec(-90)) }),
    );
    const r = record([original, cpr(T0), details]);
    expect(r.witnessed).toBe(true);
    expect(r.monitored).toBe(false);
    expect(r.collapseAtIso).toBe(iso(sec(-90)));
  });

  it("CO-UTS-01: a re-arrest declaration with the fields unset does not erase earlier details", () => {
    const original = declare(T0, 1);
    const details = correcting(original, declare(T0, 1, { witnessed: true, monitored: true }));
    const reArrest = declare(min(8), 1, { witnessed: null, monitored: null });
    const r = record([original, cpr(T0), details, rosc(min(5)), reArrest]);
    expect(r.witnessed).toBe(true);
    expect(r.monitored).toBe(true);
  });

  it("CO-UTS-02: collapse defaults to the declaration (ALS-REC-09); CPR start = cpr_started", () => {
    const r = record([declare(T0), cpr(sec(20))]);
    expect(r.arrestAtIso).toBe(iso(T0));
    expect(r.collapseAtIso).toBe(iso(T0));
    expect(r.cprStartedAtIso).toBe(iso(sec(20)));
  });

  it("CO-UTS-02: recorded collapse and CPR-before-declaration times are used", () => {
    const r = record([
      declare(T0, 1, { collapseAtIso: iso(min(-3)), cprBeforeDeclarationAtIso: iso(min(-2)) }),
      cpr(T0),
    ]);
    expect(r.arrestAtIso).toBe(iso(T0));
    expect(r.collapseAtIso).toBe(iso(min(-3)));
    expect(r.cprStartedAtIso).toBe(iso(min(-2)));
  });

  it("CO-UTS-02: an undeclared arrest has no record (RangeError)", () => {
    expect(() => projectArrestRecord(started(), 2, min(5))).toThrow(RangeError);
    expect(() => projectArrestRecord([], 1, min(5))).toThrow(RangeError);
  });
});

describe("Utstein record — rhythm, shocks, adrenaline, airway (CO-UTS-03..07)", () => {
  it("CO-UTS-03: first documented rhythm = the first rhythm check (ALS-RHY-03)", () => {
    expect(record(started()).firstRhythm).toBeNull();
    const pea = check(sec(60), "organised", 1, false); // no pulse → PEA (ALS-RHY-02)
    expect(record([...started(), pea, check(min(3), "vf_pvt")]).firstRhythm).toBe("pea");
  });

  it("CO-UTS-04: shocks delivered (each stacked shock counted), time of the first and minutes from arrest", () => {
    const events = [
      ...started(),
      shock(sec(30), 1, true),
      shock(sec(40), 1, true),
      shock(sec(50), 1, true),
      check(min(3), "vf_pvt"),
      shock(min(3) + 5_000),
    ];
    const r = record(events);
    expect(r.defibrillatorApplied).toBe(true);
    expect(r.shocksGiven).toBe(4);
    expect(r.firstShockAtIso).toBe(iso(sec(30)));
    expect(r.firstShockMinFromArrest).toBe(0.5);
  });

  it("CO-UTS-04: no shock and no pads → defibrillator not recorded (null), 0 shocks, no first shock", () => {
    const r = record([...started(), check(sec(60), "asystole")]);
    expect(r.defibrillatorApplied).toBeNull();
    expect(r.shocksGiven).toBe(0);
    expect(r.firstShockAtIso).toBeNull();
    expect(r.firstShockMinFromArrest).toBeNull();
  });

  it("CO-UTS-04: pads recorded without a shock → defibrillator applied", () => {
    const r = record([...started(), proc(sec(45), "pads_antero_posterior")]);
    expect(r.defibrillatorApplied).toBe(true);
    expect(r.shocksGiven).toBe(0);
  });

  it("CO-UTS-05: time of first adrenaline; an IM dose of the molecule is not an arrest dose", () => {
    const none = record([...started(), drug(sec(30), "adrenaline_im", "adrenaline", 0.5, "im")]);
    expect(none.firstAdrenalineAtIso).toBeNull();
    expect(none.firstAdrenalineMinFromArrest).toBeNull();
    const r = record([...started(), adrenaline(sec(150)), adrenaline(min(6))]);
    expect(r.firstAdrenalineAtIso).toBe(iso(sec(150)));
    expect(r.firstAdrenalineMinFromArrest).toBe(2.5);
  });

  it("CO-UTS-06: highest airway used (BVM < SGA < ETT); null when none recorded", () => {
    expect(record(started()).airwayHighest).toBeNull();
    const events = [
      ...started(),
      proc(sec(20), "airway_bvm"),
      proc(min(4), "airway_ett", { ettTrace: "yes" }),
      proc(min(6), "airway_sga"),
    ];
    expect(record(events).airwayHighest).toBe("ett");
  });

  it("CO-UTS-06: a tube from an earlier arrest counts for the next; a later airway never leaks back", () => {
    const events = [
      ...started(),
      proc(min(2), "airway_sga"),
      rosc(min(5)),
      declare(min(40), 2),
      cpr(min(40), 2),
      proc(min(42), "airway_ett", { ettTrace: "yes" }, 2),
    ];
    expect(record(events, min(50), 1).airwayHighest).toBe("sga");
    expect(record(events, min(50), 2).airwayHighest).toBe("ett");
  });

  it("CO-UTS-07: ECPR is not recordable in the contract (capability off, ALS-DEV-01) → null", () => {
    expect(record([...started(), shock(sec(30))]).ecpr).toBeNull();
  });
});

describe("Utstein record — ROSC and how CPR ended (CO-UTS-08)", () => {
  const vf = [...started(), check(sec(60), "vf_pvt"), shock(sec(65))];

  it("CO-UTS-08: still in arrest → no ROSC, CPR not stopped", () => {
    const r = record(vf, min(4));
    expect(r.anyRosc).toBe(false);
    expect(r.sustainedRosc).toBe(false);
    expect(r.cprStoppedAtIso).toBeNull();
    expect(r.cprStoppedReason).toBeNull();
  });

  it("CO-UTS-08: sustained ROSC (20 min, ALS-ROSC-03) → survived event; CPR stopped at the ROSC (ALS-ROSC-06)", () => {
    const r = record([...vf, rosc(min(5))], min(25));
    expect(r.anyRosc).toBe(true);
    expect(r.sustainedRosc).toBe(true);
    expect(r.cprStoppedAtIso).toBe(iso(min(5)));
    expect(r.cprStoppedReason).toBe("survived_event");
  });

  it("CO-UTS-08: a ROSC under 20 min old is not yet determinable → null, never a guess", () => {
    const r = record([...vf, rosc(min(5))], min(25) - 1);
    expect(r.anyRosc).toBe(true);
    expect(r.sustainedRosc).toBeNull();
    expect(r.cprStoppedAtIso).toBeNull();
    expect(r.cprStoppedReason).toBeNull();
  });

  it("CO-UTS-08: intermittent ROSC, re-arrest, then stopped → any ROSC, not sustained, died at the stop", () => {
    const events = [...vf, rosc(min(5)), declare(min(9), 1), stop(min(30))];
    const r = record(events, min(90));
    expect(r.anyRosc).toBe(true);
    expect(r.sustainedRosc).toBe(false);
    expect(r.cprStoppedAtIso).toBe(iso(min(30)));
    expect(r.cprStoppedReason).toBe("died");
  });

  it("CO-UTS-08: death confirmed after the stop → died; time CPR stopped = the stop (not the confirmation)", () => {
    const events = [...vf, stop(min(25)), ev("death_confirmed", min(31), { label: "" })];
    const r = record(events, min(40));
    expect(r.anyRosc).toBe(false);
    expect(r.cprStoppedReason).toBe("died");
    expect(r.cprStoppedAtIso).toBe(iso(min(25)));
  });

  it("CO-UTS-08: a new arrest after sustained ROSC (ALS-ROSC-05) leaves arrest 1 as survived; arrest 2 has its own outcome", () => {
    const events = [...vf, rosc(min(5)), declare(min(40), 2), cpr(min(40), 2), stop(min(60), 2)];
    const first = record(events, min(70), 1);
    expect(first.sustainedRosc).toBe(true);
    expect(first.cprStoppedReason).toBe("survived_event");
    expect(first.shocksGiven).toBe(1);
    const second = record(events, min(70), 2);
    expect(second.arrestAtIso).toBe(iso(min(40)));
    expect(second.anyRosc).toBe(false);
    expect(second.shocksGiven).toBe(0);
    expect(second.cprStoppedReason).toBe("died");
    expect(second.cprStoppedAtIso).toBe(iso(min(60)));
  });
});

describe("Utstein record — prior treatment limitation (CO-UTS-09)", () => {
  it("CO-UTS-09: a treatment-limitation decision recorded before the arrest is flagged", () => {
    expect(record(started()).priorTreatmentLimitation).toBe(false);
    expect(record([limitation(min(-30)), ...started()]).priorTreatmentLimitation).toBe(true);
  });

  it("CO-UTS-09: one recorded during arrest 1 is not prior to arrest 1, but is prior to arrest 2", () => {
    const events = [...started(), limitation(min(3)), rosc(min(5)), declare(min(40), 2)];
    expect(record(events, min(45), 1).priorTreatmentLimitation).toBe(false);
    expect(record(events, min(45), 2).priorTreatmentLimitation).toBe(true);
  });

  it("CO-UTS-09: an undone (superseded) limitation does not count", () => {
    const lim = limitation(min(-30));
    const undo = correcting(lim, ev("note", min(-20), { noteKind: "correction", label: "" }));
    expect(record([lim, undo, ...started()]).priorTreatmentLimitation).toBe(false);
  });

  it("CO-UTS-09: the whole record is plain JSON (survives a round trip unchanged)", () => {
    const r = record([limitation(min(-30)), ...started(), shock(sec(30)), rosc(min(5))], min(30));
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
