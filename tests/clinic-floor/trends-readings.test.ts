/**
 * Follow-up 3: stored triage readings become trend readings by projection only. BP needs both numbers; triage sugar
 * is untimed (S21); the source says today, earlier here, or another hospital.
 */
import { describe, expect, it } from "vitest";

import { FLOOR } from "@/content/clinic-floor/floor";
import { triageReadings } from "@/lib/clinic-floor/trends";

const here = { hospitalId: "h1", dayStart: Date.UTC(2026, 10, 16) };
const L = FLOOR.trends.source;

describe("triageReadings", () => {
  it("projects BP and untimed sugar, labelled by when and where", () => {
    const rows = [
      {
        at: here.dayStart + 1,
        hospitalId: "h1",
        vitals: { systolicBp: 140, diastolicBp: 90, bloodGlucose: 7.2 },
      },
      { at: here.dayStart - 1, hospitalId: "h1", vitals: { systolicBp: 130, diastolicBp: 85 } },
      { at: here.dayStart - 2, hospitalId: "h2", vitals: { systolicBp: 150, diastolicBp: 95 } },
    ];
    expect(triageReadings(rows, here, L)).toEqual([
      { code: "bp", at: here.dayStart + 1, value: 140, value2: 90, source: L.today },
      { code: "sugar_random", at: here.dayStart + 1, value: 7.2, source: L.today },
      { code: "bp", at: here.dayStart - 1, value: 130, value2: 85, source: L.earlier },
      { code: "bp", at: here.dayStart - 2, value: 150, value2: 95, source: L.elsewhere },
    ]);
  });

  it("drops a half blood pressure and never makes a timed glucose", () => {
    const r = triageReadings(
      [
        {
          at: 1,
          hospitalId: "h1",
          vitals: { systolicBp: 140, diastolicBp: null, bloodGlucose: 5 },
        },
      ],
      here,
      L,
    );
    expect(r.map((x) => x.code)).toEqual(["sugar_random"]);
  });
});
