import { describe, expect, it } from "vitest";

import { classifyAirway } from "@/lib/resus/airway";
import { computeArrestState } from "@/lib/resus/als/engine";
import { cycleStatusAt } from "@/lib/resus/als/timing";
import { detectArrest } from "@/lib/resus/arrest";
import {
  check,
  cpr,
  ctxOf,
  declare,
  ev,
  min,
  MIN,
  rosc,
  sec,
  shock,
  started,
  stop,
  T0,
} from "./fixtures";

/** ALS engine — declaration, status, durations and the 2-minute cycle (catalog §1–§2). */

const at = (events: Parameters<typeof computeArrestState>[0], nowMs: number) =>
  computeArrestState(events, nowMs, ctxOf());

describe("declaration and status", () => {
  it("ALS-REC-01: recognition stays the v1 seam — unresponsive + no pulse is an arrest", () => {
    expect(detectArrest({ responsive: false, centralPulse: false }).isArrest).toBe(true);
    expect(detectArrest({ responsive: true, centralPulse: false }).isArrest).toBe(false);
  });

  it("ALS-REC-02: apnoea with signs of life classifies as ventilate, not the arrest pathway", () => {
    const s = classifyAirway({ patency: "apnoeic", present: [], difficulty: [], context: {} });
    expect(s).toBe("apnoeic_ventilate");
  });

  it("ALS-REC-04: the declaration stamps arrest time, CPR start and arrest number", () => {
    const s = at(started(), sec(30));
    expect(s.status).toBe("in_arrest");
    expect(s.arrestSeq).toBe(1);
    expect(s.arrestAtMs).toBe(T0);
    expect(s.cprStartMs).toBe(T0);
  });

  it("ALS-REC-04: without a cpr_started event CPR start defaults to the arrest time", () => {
    const s = at([declare(T0)], sec(10));
    expect(s.cprStartMs).toBe(T0);
  });

  it("ALS-REC-04: no declaration → status none, sequence 0, no clocks and no prompts", () => {
    const s = at([], sec(10));
    expect(s.status).toBe("none");
    expect(s.arrestSeq).toBe(0);
    expect(s.arrestAtMs).toBeNull();
    expect(s.cycle.dueAtMs).toBeNull();
    expect(s.prompts).toEqual([]);
    expect(s.arrestElapsedMs).toBe(0);
  });

  it("ALS-ROSC-06: a stop record sets status stopped and freezes the arrest duration", () => {
    const s = at([...started(), check(sec(120), "asystole"), stop(min(25))], min(40));
    expect(s.status).toBe("stopped");
    expect(s.arrestElapsedMs).toBe(25 * MIN);
    expect(s.cprElapsedMs).toBe(25 * MIN);
  });

  it("ALS-SHK-02: legacy events without an arrest sequence count as arrest 1 by time", () => {
    const legacyDecl = ev("arrest_detected", T0, { reason: "legacy" });
    const legacyShock = ev("shock", sec(60), {});
    const s = at([legacyDecl, legacyShock], sec(90));
    expect(s.arrestSeq).toBe(1);
    expect(s.shocks.count).toBe(1);
  });

  it("ALS-SHK-02: a superseded (corrected) shock is not counted", () => {
    const wrong = shock(sec(60));
    const fix = { ...ev("note", sec(61), {}), supersedesEventId: wrong.id };
    expect(at([...started(), wrong, fix], sec(90)).shocks.count).toBe(0);
  });
});

describe("durations", () => {
  it("ALS-REC-04: arrest elapsed runs from the declaration to now while in arrest", () => {
    expect(at(started(), min(7)).arrestElapsedMs).toBe(7 * MIN);
  });

  it("ALS-ROSC-04: CPR time sums the in-arrest intervals across intermittent ROSC", () => {
    const events = [...started(), rosc(min(4)), declare(min(10)), cpr(min(10))];
    const s = at(events, min(13));
    expect(s.cprElapsedMs).toBe(7 * MIN); // 0–4 and 10–13
    expect(s.arrestElapsedMs).toBe(13 * MIN);
  });

  it("ALS-ROSC-06: after ROSC the arrest duration ends at the ROSC time", () => {
    const s = at([...started(), rosc(min(6))], min(9));
    expect(s.arrestElapsedMs).toBe(6 * MIN);
    expect(s.cprElapsedMs).toBe(6 * MIN);
  });

  it("ALS-REC-04: CPR started after the declaration counts CPR time from CPR start", () => {
    const s = at([declare(T0), cpr(sec(30))], sec(90));
    expect(s.cprStartMs).toBe(sec(30));
    expect(s.cprElapsedMs).toBe(60_000);
  });
});

describe("the 2-minute cycle", () => {
  it("ALS-CPR-03: the first cycle is due 2:00 after CPR start", () => {
    const s = at(started(), sec(10));
    expect(s.cycle.startedAtMs).toBe(T0);
    expect(s.cycle.dueAtMs).toBe(sec(120));
    expect(s.cycle.number).toBe(1);
    expect(s.cycle.status).toBe("running");
  });

  it("ALS-CPR-12: running before 1:45, prepare from 1:45, due from 2:00", () => {
    expect(at(started(), sec(104)).cycle.status).toBe("running");
    expect(at(started(), sec(105)).cycle.status).toBe("prepare");
    expect(at(started(), sec(119)).cycle.status).toBe("prepare");
    expect(at(started(), sec(120)).cycle.status).toBe("due");
  });

  it("ALS-CPR-12: due through 2:15 and overdue after 2:15", () => {
    expect(at(started(), sec(135)).cycle.status).toBe("due");
    expect(at(started(), sec(136)).cycle.status).toBe("overdue");
    expect(cycleStatusAt(135_001)).toBe("overdue");
  });

  it("ALS-CPR-03: a rhythm check restarts the cycle and counts the next cycle", () => {
    const s = at([...started(), check(sec(125), "asystole")], sec(130));
    expect(s.cycle.startedAtMs).toBe(sec(125));
    expect(s.cycle.dueAtMs).toBe(sec(245));
    expect(s.cycle.number).toBe(2);
  });

  it("ALS-CPR-06: a shock after the check restarts the cycle at the shock (CPR resumes)", () => {
    const s = at([...started(), check(sec(120), "vf_pvt"), shock(sec(126))], sec(130));
    expect(s.cycle.startedAtMs).toBe(sec(126));
    expect(s.cycle.dueAtMs).toBe(sec(246));
  });

  it("ALS-CPR-12: an overdue cycle raises an overdue prompt sorted first", () => {
    const s = at(started(), sec(140));
    expect(s.prompts[0]?.severity).toBe("overdue");
    expect(s.prompts[0]?.ruleId).toBe("ALS-CPR-12");
  });

  it("ALS-CPR-03: a due cycle raises the rhythm-check prompt (identify within 5 s)", () => {
    const p = at(started(), sec(121)).prompts.find((x) => x.id === "cycle_due");
    expect(p?.ruleId).toBe("ALS-CPR-03");
    expect(p?.text).toMatch(/5 s/);
  });

  it("ALS-CPR-12: the prepare window raises an info prompt", () => {
    const p = at(started(), sec(110)).prompts.find((x) => x.id === "cycle_prepare");
    expect(p?.severity).toBe("info");
  });

  it("ALS-CPR-03: after ROSC the cycle timer is idle (no due time)", () => {
    const s = at([...started(), rosc(min(3))], min(4));
    expect(s.cycle.startedAtMs).toBeNull();
    expect(s.cycle.dueAtMs).toBeNull();
    expect(s.cycle.status).toBe("running");
  });

  it("ALS-CPR-03: a re-arrest within the same arrest restarts the cycle at the re-arrest", () => {
    const s = at([...started(), rosc(min(3)), declare(min(8))], min(8) + 30_000);
    expect(s.cycle.startedAtMs).toBe(min(8));
  });
});
