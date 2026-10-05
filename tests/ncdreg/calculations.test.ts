/**
 * §5.4 calculations: the four hand-computed eGFR cross-checks, every category boundary, units,
 * the hypertension grade table, care band and patient status order.
 */
import type { CareBandInput } from "@/lib/ncdreg/standard/calculations";
import { describe, expect, it } from "vitest";

import {
  bmi,
  careBand,
  creatinineMgdlToUmol,
  egfr,
  footRisk,
  glucoseMgdlToMmol,
  hba1cMmolMol,
  htnGrade,
  kdigoA,
  kdigoG,
  parseBp,
  patientStatus,
  visitBp,
} from "@/lib/ncdreg/standard/calculations";

const mgdl = (x: number) => x * 88.4;

describe("eGFR, 2021 CKD-EPI (prompt cross-checks)", () => {
  it.each([
    [1.0, 50, "male", 92],
    [0.7, 60, "female", 99],
    [2.0, 40, "female", 32],
    [0.6, 30, "male", 133],
  ] as const)("%s mg/dL, %s y, %s → %s", (scr, age, sex, want) => {
    expect(egfr(mgdl(scr), age, sex)).toBe(want);
  });
});

describe("KDIGO categories", () => {
  it.each([
    [90, "G1"],
    [89, "G2"],
    [60, "G2"],
    [59, "G3a"],
    [45, "G3a"],
    [44, "G3b"],
    [30, "G3b"],
    [29, "G4"],
    [15, "G4"],
    [14, "G5"],
    [0, "G5"],
  ] as const)("eGFR %s → %s", (v, g) => expect(kdigoG(v)).toBe(g));
  it.each([
    [0, "A1"],
    [2.9, "A1"],
    [3, "A2"],
    [30, "A2"],
    [30.1, "A3"],
    [null, null],
  ] as const)("ACR %s → %s", (v, a) => expect(kdigoA(v)).toBe(a));
});

describe("units and simple calculations", () => {
  it("BMI 1 dp", () => expect(bmi(83.6, 163)).toBe(31.5));
  it("visit BP is the rounded mean", () => {
    expect(
      visitBp([
        [152, 94],
        [148, 90],
      ]),
    ).toEqual([150, 92]);
    expect(
      visitBp([
        [121, 81],
        [120, 80],
      ]),
    ).toEqual([121, 81]); // 120.5 → 121
    expect(visitBp([])).toBeNull();
  });
  it("parses '120/80' and rejects anything else", () => {
    expect(parseBp("120/80")).toEqual([120, 80]);
    expect(parseBp(" 152 / 94 ")).toEqual([152, 94]);
    expect(parseBp("120-80")).toBeNull();
    expect(parseBp("1200/80")).toBeNull();
  });
  it("glucose mg/dL → mmol/L ÷ 18.016, 1 dp", () => expect(glucoseMgdlToMmol(126)).toBe(7.0));
  it("creatinine mg/dL × 88.4", () => expect(creatinineMgdlToUmol(1)).toBe(88.4));
  it("HbA1c mmol/mol", () => {
    expect(hba1cMmolMol(7.0)).toBe(53);
    expect(hba1cMmolMol(9.6)).toBe(81);
  });
});

describe("foot risk category", () => {
  const base = {
    loss_of_protective_sensation: false,
    absent_pulses: false,
    deformity: false,
    previous_ulcer: false,
    amputation: "none" as const,
    end_stage_kidney_disease: false,
  };
  it("0: sensation and pulses present", () => expect(footRisk(base)).toBe(0));
  it("0 even with deformity alone", () => expect(footRisk({ ...base, deformity: true })).toBe(0));
  it("1: one of LOPS or absent pulses", () => {
    expect(footRisk({ ...base, loss_of_protective_sensation: true })).toBe(1);
    expect(footRisk({ ...base, absent_pulses: true })).toBe(1);
  });
  it("2: both, or one with deformity", () => {
    expect(footRisk({ ...base, loss_of_protective_sensation: true, absent_pulses: true })).toBe(2);
    expect(footRisk({ ...base, absent_pulses: true, deformity: true })).toBe(2);
  });
  it("3: one plus ulcer history, amputation or end-stage kidney disease", () => {
    expect(footRisk({ ...base, absent_pulses: true, previous_ulcer: true })).toBe(3);
    expect(footRisk({ ...base, loss_of_protective_sensation: true, amputation: "minor" })).toBe(3);
    expect(
      footRisk({ ...base, loss_of_protective_sensation: true, end_stage_kidney_disease: true }),
    ).toBe(3);
  });
});

describe("hypertension grade (draft table)", () => {
  it.each([
    [[139, 89], null],
    [[140, 80], 1],
    [[130, 90], 1],
    [[159, 99], 1],
    [[160, 99], 2],
    [[150, 100], 2],
    [[179, 109], 2],
    [[180, 70], 3],
    [[120, 110], 3],
  ] as const)("%j → %s", (bp, g) => expect(htnGrade(bp)).toBe(g));
});

describe("care band", () => {
  const p = (o: Partial<CareBandInput>): CareBandInput => ({
    registrations: [],
    knownCvd: [],
    eventTypes: [],
    latestKidney: null,
    latestEyes: null,
    latestFeet: null,
    ...o,
  });
  it("null without a diabetes or hypertension registration", () =>
    expect(careBand(p({ registrations: ["asthma"] }))).toBeNull());
  it("the three uncomplicated bands", () => {
    expect(careBand(p({ registrations: ["hypertension"] }))).toBe("hypertension_only");
    expect(careBand(p({ registrations: ["diabetes"] }))).toBe("diabetes_only");
    expect(careBand(p({ registrations: ["diabetes", "hypertension"] }))).toBe(
      "both_without_complications",
    );
  });
  it.each<[string, Partial<CareBandInput>]>([
    ["CKD registration", { registrations: ["hypertension", "chronic_kidney_disease"] }],
    ["known CVD", { knownCvd: ["stroke"] }],
    ["stroke event", { eventTypes: ["stroke"] }],
    ["dialysis event", { eventTypes: ["dialysis_start"] }],
    ["eGFR 59", { latestKidney: { egfr: 59, kdigoA: null } }],
    ["ACR A2", { latestKidney: { egfr: 90, kdigoA: "A2" } }],
    ["mild NPDR", { latestEyes: { retinopathy_grade: "mild_npdr", macular_oedema: "absent" } }],
    [
      "macular oedema",
      { latestEyes: { retinopathy_grade: "no_apparent_retinopathy", macular_oedema: "present" } },
    ],
    ["foot risk 2", { latestFeet: { risk: 2, current_ulcer: false, amputation: "none" } }],
  ])("%s → either_with_complications", (_, o) => {
    expect(careBand(p({ registrations: ["diabetes"], ...o }))).toBe("either_with_complications");
  });
  it("eGFR 60, A1, no retinopathy, foot risk 1 stays uncomplicated", () => {
    expect(
      careBand(
        p({
          registrations: ["diabetes"],
          latestKidney: { egfr: 60, kdigoA: "A1" },
          latestEyes: { retinopathy_grade: "no_apparent_retinopathy", macular_oedema: "absent" },
          latestFeet: { risk: 1, current_ulcer: false, amputation: "none" },
        }),
      ),
    ).toBe("diabetes_only");
  });
});

describe("patient status order", () => {
  const base = {
    asOf: "2026-10-05",
    firstRegistered: "2025-01-01",
    events: [],
    visitDates: ["2026-08-01"],
    appointmentDates: [],
  };
  it("active", () => expect(patientStatus(base)).toBe("active"));
  it("died wins over everything", () =>
    expect(
      patientStatus({
        ...base,
        events: [
          { type: "withdrawal", date: "2026-01-01" },
          { type: "death", date: "2026-09-01" },
        ],
      }),
    ).toBe("died"));
  it("withdrawn", () =>
    expect(patientStatus({ ...base, events: [{ type: "withdrawal", date: "2026-09-01" }] })).toBe(
      "withdrawn",
    ));
  it("transferred out unless a later visit", () => {
    expect(patientStatus({ ...base, events: [{ type: "transfer_out", date: "2026-09-01" }] })).toBe(
      "transferred_out",
    );
    expect(patientStatus({ ...base, events: [{ type: "transfer_out", date: "2026-07-01" }] })).toBe(
      "active",
    );
  });
  it("lost to follow-up only when registered 12 months ago or more", () => {
    expect(patientStatus({ ...base, visitDates: ["2025-06-01"] })).toBe("lost_to_follow_up");
    expect(patientStatus({ ...base, firstRegistered: "2026-01-01", visitDates: [] })).toBe(
      "active",
    );
  });
  it("overdue when an appointment passed with no visit on or after it", () => {
    expect(patientStatus({ ...base, appointmentDates: ["2026-09-01"] })).toBe("overdue");
    expect(patientStatus({ ...base, appointmentDates: ["2026-08-01"] })).toBe("active");
    expect(patientStatus({ ...base, appointmentDates: ["2026-10-05"] })).toBe("active"); // today is not passed
  });
});
