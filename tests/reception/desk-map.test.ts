import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DESK } from "@/content/reception/desk";
import { bookingRow, deskSessions, setUpClinics, sexOf } from "@/lib/reception/desk/map";

const booking = (over: Partial<Parameters<typeof bookingRow>[0]> = {}) =>
  bookingRow({
    id: "a1",
    status: "confirmed",
    startsAtIso: "2026-11-13T05:00:00Z",
    arrivalWindowStartIso: "2026-11-13T06:00:00Z",
    hereSinceIso: null,
    seen: false,
    departmentId: "d1",
    clinicianName: null,
    patientCode: "TH-000001",
    bookingCode: "K7M42Q",
    confirmedByPatient: true,
    identity: { displayName: null, ageYears: null, sex: null, complaint: null, photoUrl: null },
    provisional: null,
    ...over,
  });

describe("desk map", () => {
  it("maps booking statuses to desk stages and drops cancelled ones", () => {
    expect(booking()?.stage).toBe("expected");
    expect(booking()?.go).toEqual({ st: "coming" });
    expect(booking({ status: "arrived" })?.stage).toBe("here");
    expect(booking({ status: "no_show" })?.stage).toBe("notseen");
    expect(booking({ status: "arrived", seen: true })?.stage).toBe("done");
    expect(booking({ status: "cancelled" })).toBeNull();
  });

  it("never invents a name, sex or age", () => {
    const r = booking()!;
    expect(r.name).toBe(DESK.row.noName);
    expect(r.sex).toBe("?");
    expect(r.age).toBeNull();
    expect(r.time).toBe("09:00"); // the arrival window, in Kampala
    expect(sexOf("female")).toBe("F");
  });

  it("keeps one session per clinic per day", () => {
    const s = {
      departmentId: "d1",
      startsAt: new Date("2026-11-13T05:00:00Z"),
      endsAt: new Date("2026-11-13T09:00:00Z"),
      capacityTotal: 20,
      bookedCount: 4,
      delayMinutes: 0,
      clinician: null,
    };
    const out = deskSessions([
      { id: "s1", ...s },
      { id: "s2", ...s },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "2026-11-13|d1", sessionId: "s1", st: 8, en: 12 });
  });
});

describe("the clinics a desk or clinic line shows are the ones the admin set up", () => {
  const depts = [
    { id: "d-ae", name: "Accident and Emergency", catalogueCode: "EMERGENCY" },
    { id: "d-ent", name: "ENT", catalogueCode: "ENT" },
    { id: "d-med", name: "Medicine", catalogueCode: "MEDICINE" },
    { id: "u-chem", name: "Clinical Chemistry", catalogueCode: "CLIN_CHEM" },
    { id: "u-alvin", name: "ALVIN Ward", catalogueCode: null },
    { id: "d-den", name: "Dental", catalogueCode: "DENTAL" },
  ];
  const lines = [
    { departmentId: "d-ent", name: "ENT clinic" },
    { departmentId: "d-med", name: "Diabetes clinic" },
    { departmentId: "d-med", name: "Hypertension clinic" },
  ];

  it("a lab section or a ward unit with no clinic is not listed", () => {
    const shown = setUpClinics(depts, lines, new Set());
    expect(shown.map((d) => d.id)).toEqual(["d-ae", "d-ent", "d-med"]);
  });

  it("the emergency department stays: it receives emergencies with no clinic set up", () => {
    expect(setUpClinics(depts, [], new Set()).map((d) => d.id)).toEqual(["d-ae"]);
  });

  it("a department with one clinic carries the clinic's name; with several, its own", () => {
    const shown = setUpClinics(depts, lines, new Set());
    expect(shown.find((d) => d.id === "d-ent")!.name).toBe("ENT clinic");
    expect(shown.find((d) => d.id === "d-med")!.name).toBe("Medicine");
  });

  it("nobody already in line vanishes: a department with a person today is kept", () => {
    const shown = setUpClinics(depts, lines, new Set(["d-den"]));
    expect(shown.map((d) => d.id)).toContain("d-den");
    expect(shown.map((d) => d.id)).not.toContain("u-chem");
  });

  it("both the clinic line and the reception desk read the list this way", () => {
    for (const f of ["lib/clinic-floor/load.ts", "lib/reception/desk/load.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("setUpClinics(");
      expect(src, f).toContain("listClinicDepartments(scope.hospitalId)");
      expect(src, f).not.toContain("listHospitalDepartments(");
    }
  });
});
