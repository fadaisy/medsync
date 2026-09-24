import { describe, expect, it } from "vitest";

import { arrestSeqForDeclaration, computeArrestState } from "@/lib/resus/als/engine";
import {
  adrenaline,
  check,
  cpr,
  ctxOf,
  declare,
  ev,
  MIN,
  min,
  rosc,
  sec,
  shock,
  started,
  stop,
  T0,
} from "./fixtures";

/** ALS engine — ROSC, sustained ROSC and the arrest sequence (catalog §8, ALS-ROSC-01..07). */

const vfArrest = [...started(), check(sec(120), "vf_pvt"), shock(sec(125)), adrenaline(sec(130))];

describe("ROSC", () => {
  it("ALS-ROSC-01: a ROSC record ends the arrest and stamps its time", () => {
    const s = computeArrestState([...vfArrest, rosc(min(5))], min(6), ctxOf());
    expect(s.status).toBe("rosc");
    expect(s.rosc.atMs).toBe(min(5));
    expect(s.prompts.map((p) => p.ruleId)).toEqual(["ALS-ROSC-03"]);
  });

  it("ALS-ROSC-02: without a ROSC record there is no ROSC time", () => {
    const s = computeArrestState(vfArrest, min(3), ctxOf());
    expect(s.rosc).toEqual({
      atMs: null,
      sustainedAtMs: null,
      sustained: false,
      intermittentCount: 0,
    });
  });

  it("ALS-ROSC-03: sustained ROSC after 20 consecutive minutes (the 20:00 timer)", () => {
    const events = [...vfArrest, rosc(min(5))];
    const early = computeArrestState(events, min(25) - 1, ctxOf());
    expect(early.rosc.sustainedAtMs).toBe(min(25));
    expect(early.rosc.sustained).toBe(false);
    const late = computeArrestState(events, min(25), ctxOf());
    expect(late.rosc.sustained).toBe(true);
    expect(late.prompts).toEqual([]);
  });

  it("ALS-ROSC-04: re-arrest before 20 min keeps the same arrest, counters intact", () => {
    const at = min(13);
    expect(arrestSeqForDeclaration([...vfArrest, rosc(min(5))], at)).toBe(1);
    const s = computeArrestState([...vfArrest, rosc(min(5)), declare(at, 1)], at + 30_000, ctxOf());
    expect(s.arrestSeq).toBe(1);
    expect(s.status).toBe("in_arrest");
    expect(s.shocks.count).toBe(1);
    expect(s.adrenaline.doses).toBe(1);
    expect(s.rosc.intermittentCount).toBe(1);
    expect(s.rosc.sustainedAtMs).toBeNull();
  });

  it("ALS-ROSC-05: re-arrest after sustained ROSC opens arrest 2 with fresh counters", () => {
    const at = min(40);
    const history = [...vfArrest, rosc(min(5))];
    expect(arrestSeqForDeclaration(history, at)).toBe(2);
    const s = computeArrestState([...history, declare(at, 2), cpr(at, 2)], at + MIN, ctxOf());
    expect(s.arrestSeq).toBe(2);
    expect(s.arrestAtMs).toBe(at);
    expect(s.shocks.count).toBe(0);
    expect(s.adrenaline.doses).toBe(0);
    expect(s.rosc.intermittentCount).toBe(0);
    expect(s.episodeTotalsMg).toEqual({ adrenaline: 1 });
  });

  it("ALS-ROSC-05: exactly 20 min after ROSC is sustained — a new arrest opens", () => {
    expect(arrestSeqForDeclaration([...vfArrest, rosc(min(5))], min(25))).toBe(2);
    expect(arrestSeqForDeclaration([...vfArrest, rosc(min(5))], min(25) - 1)).toBe(1);
  });

  it("ALS-ROSC-05: the first declaration is arrest 1; a repeat tap during an arrest keeps it", () => {
    expect(arrestSeqForDeclaration([], min(1))).toBe(1);
    expect(arrestSeqForDeclaration(vfArrest, min(3))).toBe(1);
  });

  it("ALS-ROSC-04/05: a resume after a stop (no sustained ROSC) is the same arrest, counters intact", () => {
    const history = [...vfArrest, adrenaline(min(29)), stop(min(30))];
    expect(arrestSeqForDeclaration(history, min(31))).toBe(1);
    const s = computeArrestState(
      [...history, declare(min(31), 1), check(min(31) + 30_000, "asystole")],
      min(31) + 40_000,
      ctxOf(),
    );
    expect(s.arrestSeq).toBe(1);
    expect(s.status).toBe("in_arrest");
    expect(s.shocks.count).toBe(1);
    expect(s.adrenaline.doses).toBe(2);
    expect(s.adrenaline.status).toBe("waiting"); // not "1 mg now" 3 min after the last dose
    expect(s.arrestAtMs).toBe(T0); // RCUK 45-min detail keeps counting (ALS-TOR-03)
  });

  it("ALS-ROSC-05: a stop after a sustained ROSC and re-arrest still opens nothing new", () => {
    const history = [...vfArrest, rosc(min(5)), declare(min(10)), stop(min(30))];
    expect(arrestSeqForDeclaration(history, min(55))).toBe(1);
  });

  it("ALS-ROSC-04: the sequence is decided at the bedside declaration time, not at receipt", () => {
    // ROSC at 5:00, re-arrest tapped at 20:00 (15 min later) and flushed late: arrest 1.
    const history = [...vfArrest, rosc(min(5))];
    expect(arrestSeqForDeclaration(history, min(20))).toBe(1);
    // A later write already on the server (another device's arrest 2 at 26:00) is ignored.
    expect(arrestSeqForDeclaration([...history, declare(min(26), 2)], min(20))).toBe(1);
  });

  it("ALS-ROSC-05: unsequenced events after arrest 2 belong to arrest 2", () => {
    const events = [...vfArrest, rosc(min(5)), declare(min(40), 2), ev("shock", min(41), {})];
    const s = computeArrestState(events, min(42), ctxOf());
    expect(s.shocks.count).toBe(1);
    expect(s.shocks.lastAtMs).toBe(min(41));
  });

  it("ALS-ROSC-07: re-arrest is one event — a single declaration puts the console back in arrest", () => {
    const s = computeArrestState(
      [...vfArrest, rosc(min(5)), declare(min(9), 1)],
      min(9) + 1000,
      ctxOf(),
    );
    expect(s.status).toBe("in_arrest");
    expect(s.cycle.startedAtMs).toBe(min(9));
  });

  it("ALS-ROSC-04: two intermittent ROSCs are both counted", () => {
    const events = [...vfArrest, rosc(min(4)), declare(min(6)), rosc(min(8)), declare(min(10))];
    expect(computeArrestState(events, min(11), ctxOf()).rosc.intermittentCount).toBe(2);
  });
});

describe("refractory VF across an intermittent ROSC", () => {
  it("ALS-SHK-04: VF after a ROSC is recurrent — the consecutive run restarts at the ROSC", () => {
    const vf3 = [0, 1, 2].flatMap((i) => [
      check(sec(10 + 125 * i), "vf_pvt"),
      shock(sec(15 + 125 * i)),
    ]);
    const events = [
      ...started(),
      ...vf3,
      rosc(min(6)),
      declare(min(8)),
      check(min(8) + 10_000, "vf_pvt"),
    ];
    const s = computeArrestState(events, min(8) + 20_000, ctxOf());
    expect(s.shocks.count).toBe(3); // the total stays (ALS-ROSC-04)
    expect(s.shocks.consecutive).toBe(0);
    expect(s.shocks.refractoryVf).toBe(false);
    expect(s.prompts.some((p) => p.id === "refractory_vf")).toBe(false);
  });
});
