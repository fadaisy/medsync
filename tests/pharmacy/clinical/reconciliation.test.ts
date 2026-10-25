import type { Facts } from "@/lib/pharmacy/clinical/reconciliation";
import { describe, expect, it } from "vitest";

import { RULES } from "@/lib/pharmacy/clinical/content";
import {
  blockers,
  changedSince,
  discrepancies,
  rowsOf,
  sheetOf,
} from "@/lib/pharmacy/clinical/reconciliation";

const now = new Date("2026-10-25T10:00:00Z");
const hour = 3_600_000;
const base: Facts = {
  // S41: five medicines before admission, two held, one new for home (fixtures).
  before: [
    {
      medicineId: "med_a",
      statementId: "s1",
      text: "A",
      admission: "continued",
      informant: "patient",
    },
    { medicineId: "med_b", statementId: "s2", text: "B", admission: "held", informant: "patient" },
    { medicineId: "med_c", statementId: "s3", text: "C", admission: "held", informant: null },
    { medicineId: "med_d", statementId: "s4", text: "D", admission: "stopped", informant: "card" },
    {
      medicineId: null,
      statementId: "s5",
      text: "Herbal tea",
      admission: "continued",
      informant: "carer",
    },
  ],
  ward: [{ medicineId: "med_e", state: "active", lastDose: new Date(now.getTime() - 2 * hour) }],
  home: [
    { medicineId: "med_d", prescriptionId: "p1", directions: "1 daily" },
    { medicineId: "med_f", prescriptionId: "p2", directions: "" },
  ],
  decisions: [],
  allergyMedicineIds: ["med_f"],
  openQueries: 1,
  explained: [],
  confirmedAt: null,
  now,
};
const label = (r: { key: string }) => r.key;

describe("reconciliation at discharge (MR-2 to MR-7)", () => {
  it("MR-2: one row per medicine; an uncoded medicine is its own row", () => {
    const keys = rowsOf(base).map((r) => r.key);
    expect(keys).toEqual(["med_a", "med_b", "med_c", "med_d", "u:s5", "med_e", "med_f"]);
  });

  it("S41 / MR-3: the planted discrepancies fire, and only the signed-on rules", () => {
    const ids = discrepancies(base, RULES).map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "R1:med_a",
        "R3:med_b",
        "R3:med_c",
        "R2:med_d",
        "R4:med_e",
        "R6:med_f",
        "R10:med_f",
        "R11:med_f",
        "R12:med_c",
        "R14:u:s5",
        "R13:-",
      ]),
    );
    expect(discrepancies(base, ["R2"]).map((d) => d.id)).toEqual(["R2:med_d"]);
    expect(discrepancies(base, [])).toEqual([]);
  });

  it("S42 / MR-4: confirm stays off until every row has a decision and every discrepancy is settled", () => {
    expect(blockers(base, ["R2"], label)).toContain("med_a has no decision for home");
    const decided: Facts = {
      ...base,
      decisions: rowsOf(base).map((r) => ({
        rowKey: r.key,
        decision: "continue" as const,
        reason: null,
        at: now,
      })),
    };
    expect(blockers(decided, ["R2"], label)).toEqual(["R2 on med_d is not resolved or explained"]);
    const explained = { ...decided, explained: [{ discrepancy: "R2:med_d", at: now }] };
    expect(blockers(explained, ["R2"], label)).toEqual([]);
  });

  it("S45 / MR-5: a decision after confirmation reopens that row", () => {
    const f: Facts = {
      ...base,
      confirmedAt: now,
      decisions: [
        { rowKey: "med_a", decision: "changed", reason: "x", at: new Date(now.getTime() + hour) },
      ],
    };
    expect(changedSince(f)).toEqual(["med_a"]);
  });

  it("MR-7: the sheet says do not restart for a stopped medicine and skips one that ends on the ward", () => {
    const rows = rowsOf({
      ...base,
      decisions: [
        { rowKey: "med_d", decision: "stay_stopped", reason: "r", at: now },
        { rowKey: "med_e", decision: "ends_on_ward", reason: null, at: now },
        { rowKey: "med_f", decision: "new_for_home", reason: null, at: now },
      ],
    });
    expect(sheetOf(rows, label)).toEqual([
      { name: "med_d", doing: "do_not_restart" },
      { name: "med_f", doing: "new" },
    ]);
  });
});
