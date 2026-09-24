import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { debriefMetrics } from "@/lib/resus/debrief/metrics";
import {
  adrenaline,
  cause,
  check,
  cpr,
  declare,
  drug,
  ev,
  MIN,
  min,
  proc,
  rosc,
  sec,
  shock,
  started,
  T0,
  vital,
} from "./fixtures";

/** Data-driven debrief — per-arrest metrics (closeout catalog §8, CO-DBF-01..07). */

const first = (events: TimelineEvent[], nowMs = min(60)) =>
  debriefMetrics(events, nowMs).arrests[0]!;

describe("Debrief — times from the arrest (CO-DBF-01/02)", () => {
  it("CO-DBF-01: time to first shock (ms from the declaration); null without a shock", () => {
    expect(first(started()).timeToFirstShockMs).toBeNull();
    const d = first([...started(), check(sec(40), "vf_pvt"), shock(sec(45)), shock(min(3))]);
    expect(d.timeToFirstShockMs).toBe(45_000);
  });

  it("CO-DBF-01: one entry per arrest in sequence order, each timed from its own declaration", () => {
    const events = [
      ...started(),
      shock(min(1)),
      rosc(min(3)),
      declare(min(40), 2),
      cpr(min(40), 2),
      shock(min(40) + 90_000, 2),
    ];
    const { arrests } = debriefMetrics(events, min(50));
    expect(arrests.map((a) => a.arrestSeq)).toEqual([1, 2]);
    expect(arrests[0]!.timeToFirstShockMs).toBe(MIN);
    expect(arrests[1]!.timeToFirstShockMs).toBe(90_000);
  });

  it("CO-DBF-01: no arrest declared → no debrief entries", () => {
    expect(debriefMetrics([], T0).arrests).toEqual([]);
    expect(debriefMetrics([vital(T0, { hr: 80 })], T0).arrests).toEqual([]);
  });

  it("CO-DBF-02: time to first adrenaline; an IM dose is not an arrest dose", () => {
    const im = drug(sec(20), "adrenaline_im", "adrenaline", 0.5, "im");
    expect(first([...started(), im]).timeToFirstAdrenalineMs).toBeNull();
    const d = first([...started(), im, adrenaline(sec(150)), adrenaline(min(6))]);
    expect(d.timeToFirstAdrenalineMs).toBe(150_000);
  });
});

describe("Debrief — adrenaline interval adherence (CO-DBF-03)", () => {
  it("CO-DBF-03: share of intervals inside 3:00–5:00 (ALS-ADR-03), both ends inclusive", () => {
    const doses = [2, 5, 10, 16].map((m) => adrenaline(min(m))); // 3:00 ✓, 5:00 ✓, 6:00 ✗
    const d = first([...started(), ...doses]);
    expect(d.adrenalineIntervalsInWindow.n).toBe(2);
    expect(d.adrenalineIntervalsInWindow.of).toBe(3);
    expect(d.adrenalineIntervalsInWindow.value).toBeCloseTo(2 / 3);
  });

  it("CO-DBF-03: an interval under 3:00 is outside the window", () => {
    const d = first([...started(), adrenaline(min(2)), adrenaline(min(5) - 1_000)]);
    expect(d.adrenalineIntervalsInWindow).toEqual({ n: 0, of: 1, value: 0 });
  });

  it("CO-DBF-03: fewer than two doses → nothing to judge → null, never 0", () => {
    expect(first(started()).adrenalineIntervalsInWindow).toEqual({ n: 0, of: 0, value: null });
    const one = first([...started(), adrenaline(min(2))]);
    expect(one.adrenalineIntervalsInWindow).toEqual({ n: 0, of: 0, value: null });
  });

  it("CO-DBF-03: an interval spanning an intermittent ROSC (ALS-ROSC-04) is not judged", () => {
    const events = [
      ...started(),
      adrenaline(min(2)),
      adrenaline(min(6)),
      rosc(min(7)),
      declare(min(12), 1),
      adrenaline(min(13)),
      adrenaline(min(17)),
    ];
    expect(first(events).adrenalineIntervalsInWindow).toEqual({ n: 2, of: 2, value: 1 });
  });
});

describe("Debrief — rhythm-check cycles (CO-DBF-04)", () => {
  it("CO-DBF-04: share of cycles closed within 2:15 (ALS-CPR-12), a shock after the check restarting the cycle", () => {
    // 2:00 ✓ · shock at 2:05 → check at 4:20 = 2:15 ✓ (inclusive) · check at 6:40 = 2:20 ✗
    const events = [
      ...started(),
      check(sec(120), "vf_pvt"),
      shock(sec(125)),
      check(sec(260), "vf_pvt"),
      check(sec(400), "pea"),
    ];
    const d = first(events, sec(420));
    expect(d.cyclesOnTime.n).toBe(2);
    expect(d.cyclesOnTime.of).toBe(3);
    expect(d.cyclesOnTime.value).toBeCloseTo(2 / 3);
  });

  it("CO-DBF-04: a running cycle is judged only once past 2:15 — before that, nothing to judge (null)", () => {
    expect(first(started(), min(2)).cyclesOnTime).toEqual({ n: 0, of: 0, value: null });
    expect(first(started(), min(3)).cyclesOnTime).toEqual({ n: 0, of: 1, value: 0 });
  });

  it("CO-DBF-04: a cycle that overran into ROSC counts as late; one ending on time in ROSC is not judged", () => {
    const late = first([...started(), check(sec(120), "vf_pvt"), rosc(sec(300))]);
    expect(late.cyclesOnTime).toEqual({ n: 1, of: 2, value: 0.5 });
    const onTime = first([...started(), check(sec(120), "organised", 1, true), rosc(sec(130))]);
    expect(onTime.cyclesOnTime).toEqual({ n: 1, of: 1, value: 1 });
  });
});

describe("Debrief — airway and capnography (CO-DBF-05)", () => {
  it("CO-DBF-05: time to the first advanced airway of this arrest; capnography used with a confirmed trace", () => {
    const events = [
      ...started(),
      proc(sec(20), "airway_bvm"),
      proc(min(6), "airway_ett", { ettTrace: "yes" }),
    ];
    const d = first(events);
    expect(d.timeToAdvancedAirwayMs).toBe(6 * MIN);
    expect(d.advancedAirway).toBe("ett");
    expect(d.ettTrace).toBe("yes");
    expect(d.capnographyUsed).toBe(true);
  });

  it("CO-DBF-05: nothing recorded → null (unknown), never false or 0", () => {
    const d = first([...started(), proc(sec(20), "airway_bvm")]);
    expect(d.timeToAdvancedAirwayMs).toBeNull();
    expect(d.advancedAirway).toBeNull();
    expect(d.ettTrace).toBeNull();
    expect(d.capnographyUsed).toBeNull();
  });

  it("CO-DBF-05: capnography unavailable → false; an ETCO₂ reading or a 'no trace' answer → used", () => {
    const unavailable = proc(min(4), "airway_ett", { ettTrace: "unavailable" });
    expect(first([...started(), unavailable]).capnographyUsed).toBe(false);
    const noTrace = proc(min(4), "airway_ett", { ettTrace: "no" });
    expect(first([...started(), noTrace]).capnographyUsed).toBe(true);
    const sga = [...started(), proc(min(3), "airway_sga"), vital(min(5), { etco2: 2.4 })];
    const d = first(sga);
    expect(d.timeToAdvancedAirwayMs).toBe(3 * MIN);
    expect(d.advancedAirway).toBe("sga");
    expect(d.capnographyUsed).toBe(true);
  });

  it("CO-DBF-05: a tube from an earlier arrest is in place (level shown) but was not placed in this one (time null)", () => {
    const events = [
      ...started(),
      proc(min(3), "airway_ett", { ettTrace: "yes" }),
      rosc(min(5)),
      declare(min(40), 2),
      cpr(min(40), 2),
    ];
    const second = debriefMetrics(events, min(45)).arrests[1]!;
    expect(second.timeToAdvancedAirwayMs).toBeNull();
    expect(second.advancedAirway).toBe("ett");
  });
});

describe("Debrief — reversible causes and compressor rotation (CO-DBF-06/07)", () => {
  it("CO-DBF-06: none recorded → 0 of 8 addressed (known, not null)", () => {
    expect(first(started()).reversibleCausesAddressed).toEqual({ n: 0, of: 8, value: 0 });
  });

  it("CO-DBF-06: the latest state per tile counts; a tile reset to not_assessed or an undone entry does not", () => {
    const undone = cause(min(4), "tamponade", "excluded");
    const events = [
      ...started(),
      cause(min(1), "hypoxia", "suspected"),
      cause(min(3), "hypoxia", "treated"),
      cause(min(2), "tension", "excluded"),
      cause(min(2), "toxins", "suspected"),
      cause(min(5), "toxins", "not_assessed"),
      undone,
      {
        ...ev("note", min(6), { noteKind: "correction", label: "" }),
        supersedesEventId: undone.id,
      },
    ];
    expect(first(events).reversibleCausesAddressed).toEqual({ n: 2, of: 8, value: 0.25 });
  });

  it("CO-DBF-07: compressor swaps per rhythm check (ALS-CPR-11); no check → null", () => {
    expect(first(started()).compressorSwapsPerCheck).toEqual({ n: 0, of: 0, value: null });
    const events = [
      ...started(),
      check(sec(120), "pea"),
      proc(sec(121), "compressor_swap", { toName: "B" }),
      check(sec(240), "pea"),
      check(sec(360), "pea"),
      proc(sec(361), "compressor_swap", { toName: "C" }),
      check(sec(480), "pea"),
    ];
    expect(first(events).compressorSwapsPerCheck).toEqual({ n: 2, of: 4, value: 0.5 });
  });

  it("CO-DBF-07: the metrics are plain JSON (survive a round trip unchanged)", () => {
    const m = debriefMetrics([...started(), check(sec(120), "pea"), adrenaline(min(2))], min(3));
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
});
