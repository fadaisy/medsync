import { describe, expect, it } from "vitest";

import { ALARM_MAX_MS, alarmTones, alarmTransition } from "@/lib/resus/arrest-alarm";

const msg = (phase: string, state = "active") => ({ episodeId: "e1", state, phase });

describe("arrest alarm", () => {
  it("starts when an episode enters arrest, including one opened straight in arrest", () => {
    expect(alarmTransition(new Map(), msg("arrest"))).toBe("start");
    const seen = new Map([["e1", "survey"]]);
    expect(alarmTransition(seen, msg("arrest"))).toBe("start");
  });

  it("starts again on a re-arrest after ROSC, and stops on ROSC or close", () => {
    const seen = new Map<string, string>();
    expect(alarmTransition(seen, msg("arrest"))).toBe("start");
    expect(alarmTransition(seen, msg("post_rosc"))).toBe("stop");
    expect(alarmTransition(seen, msg("arrest"))).toBe("start");
    expect(alarmTransition(seen, msg("arrest", "concluded"))).toBe("stop");
  });

  it("ignores changes that neither enter nor leave arrest", () => {
    const seen = new Map<string, string>();
    expect(alarmTransition(seen, msg("survey"))).toBeNull();
    expect(alarmTransition(seen, msg("boarding"))).toBeNull();
  });

  it("schedules a repeating buzzer for the whole window and never past it", () => {
    const tones = alarmTones(ALARM_MAX_MS / 1000);
    expect(tones.length).toBeGreaterThan(150);
    const last = tones[tones.length - 1]!;
    expect(last.atS + last.lenS).toBeLessThanOrEqual(ALARM_MAX_MS / 1000);
    expect(new Set(tones.slice(0, 3).map((t) => t.hz)).size).toBe(2);
  });
});
