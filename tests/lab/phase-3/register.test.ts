import type { RegisterConfig, RegisterLine } from "@/lib/lab/register";
import { describe, expect, it } from "vitest";

import { dailyRegister, printEvent } from "@/lib/lab/register";
import { H1, H2, kla, TZ } from "./_fixtures";

/** FIXTURE register configuration (the canvas defaults stand in until OA-3). */
const config: RegisterConfig = {
  columns: [
    { key: "patient", label: "Patient" },
    { key: "test", label: "Test" },
    { key: "result", label: "Result" },
  ],
};
const line = (labNumber: string, o: Partial<RegisterLine> = {}): RegisterLine => ({
  hospitalId: H1,
  sectionId: "chemistry",
  labNumber,
  receivedAt: kla("2026-10-13 08:00"),
  outcome: { kind: "released", at: kla("2026-10-13 10:00"), formAt: null, amended: false },
  restrictedClass: null,
  values: { patient: `Patient ${labNumber}`, test: "U&E", result: "fixture" },
  ...o,
});
const lines = [
  line("L-10"),
  line("L-9"),
  line("L-11", { outcome: null }),
  line("L-12", { restrictedClass: "hiv", sectionId: "chemistry" }),
  line("L-13", {
    receivedAt: kla("2026-10-12 23:30"),
    outcome: { kind: "rejected", at: kla("2026-10-13 00:30") },
  }),
  line("L-14", {
    receivedAt: kla("2026-10-12 09:00"),
    outcome: { kind: "released", at: kla("2026-10-12 10:00"), formAt: null, amended: false },
  }),
  line("L-15", {
    receivedAt: kla("2026-10-09 09:00"),
    outcome: {
      kind: "released",
      at: kla("2026-10-13 09:00"),
      formAt: kla("2026-10-09 11:00"),
      amended: false,
    },
  }),
  line("L-16", {
    receivedAt: kla("2026-10-11 09:00"),
    outcome: { kind: "released", at: kla("2026-10-13 12:00"), formAt: null, amended: true },
  }),
  line("L-17", { sectionId: "haematology" }),
  line("L-18", { hospitalId: H2 }),
];
const general = {
  hospitalId: H1,
  sectionId: "chemistry",
  day: "2026-10-13",
  timeZone: TZ,
  register: { kind: "general" as const },
  classAccess: [] as string[],
  config,
  lines,
};

describe("daily register (§6.10)", () => {
  it("DR-1 the day's received, released and rejected lines in lab-number order, hospital-local", () => {
    const out = dailyRegister(general);
    if (!out.ok) throw new Error();
    expect(out.rows.map((r) => r.labNumber)).toEqual(["L-9", "L-10", "L-11", "L-13", "L-16"]);
    expect(out.rows.find((r) => r.labNumber === "L-13")!.notes).toEqual(["Rejected"]);
    const h2 = dailyRegister({ ...general, hospitalId: H2 });
    expect(h2.ok && h2.rows.map((r) => r.labNumber)).toEqual(["L-18"]);
  });

  it("DR-1 a back-entered downtime result sits on its form's date, with 'entered {date}'", () => {
    const out = dailyRegister({ ...general, day: "2026-10-09" });
    if (!out.ok) throw new Error();
    expect(out.rows).toEqual([
      {
        labNumber: "L-15",
        cells: ["Patient L-15", "U&E", "fixture"],
        notes: ["entered 2026-10-13"],
      },
    ]);
  });

  it("DR-2 columns come from the hospital's configuration", () => {
    const out = dailyRegister({
      ...general,
      config: {
        columns: [
          { key: "test", label: "Test" },
          { key: "missing", label: "Done by" },
        ],
      },
    });
    if (!out.ok) throw new Error();
    expect(out.columns).toEqual(["Test", "Done by"]);
    expect(out.rows[0]!.cells).toEqual(["U&E", ""]);
  });

  it("DR-3 restricted classes never print on the general register; their own register needs access", () => {
    expect(
      dailyRegister({ ...general, register: { kind: "class", restrictedClass: "hiv" } }),
    ).toEqual({ ok: false, error: "no_class_access" });
    const hiv = dailyRegister({
      ...general,
      register: { kind: "class", restrictedClass: "hiv" },
      classAccess: ["hiv"],
    });
    expect(hiv.ok && hiv.rows.map((r) => r.labNumber)).toEqual(["L-12"]);
  });

  it("DR-4 each print writes a print event with the pages printed", () => {
    expect(
      printEvent({
        hospitalId: H1,
        register: "general",
        sectionId: "chemistry",
        day: "2026-10-13",
        rows: 41,
        rowsPerPage: 20,
        printedBy: "tech-1",
        printedAt: kla("2026-10-13 18:00"),
      }),
    ).toMatchObject({
      pages: 3,
      printedBy: "tech-1",
    });
    expect(
      printEvent({
        hospitalId: H1,
        register: "general",
        sectionId: "chemistry",
        day: "2026-10-13",
        rows: 0,
        rowsPerPage: 20,
        printedBy: "t",
        printedAt: kla("2026-10-13 18:00"),
      }).pages,
    ).toBe(1);
  });

  it("DR-5 a later amendment appears on the register of the day it was made, marked Amended", () => {
    const out = dailyRegister(general);
    if (!out.ok) throw new Error();
    expect(out.rows.find((r) => r.labNumber === "L-16")!.notes).toEqual(["Amended"]);
  });
});
