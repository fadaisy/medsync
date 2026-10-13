import type { Cell, Count105, HmisForm } from "@/lib/lab/hmis105";
import { describe, expect, it } from "vitest";

import formJson from "@/data/lab/hmis105-2019-09.json";
import {
  cellKey,
  count105,
  hmisReminder,
  hmisTransition,
  mappingSignErrors,
  revisionDiff,
  rowKey,
  toCsv,
  unmappedTests,
} from "@/lib/lab/hmis105";
import { H2, kla, TZ } from "./_fixtures";
import expected from "./fixtures/count105-expected.json";
import { MAPPING, MENU, REPORTS, SEPTEMBER } from "./fixtures/count105-month";

const form = formJson as HmisForm;
/** The reviewed projection: value, bedside share and manual mark per cell. */
const project = (c: Count105) => ({
  month: c.month,
  cells: Object.fromEntries(
    Object.entries(c.cells).map(([k, v]) => [
      k,
      {
        value: v.value,
        ...(v.bedside ? { bedside: v.bedside } : {}),
        ...(v.manual ? { manual: true } : {}),
      },
    ]),
  ),
  unmapped: c.unmapped,
  purposeNotRecorded: c.purposeNotRecorded,
  manualIgnored: c.manualIgnored,
});
const sept = count105(SEPTEMBER);
const cell = (key: string) => sept.cells[key]?.value;

describe("HMIS 105 (§6.11)", () => {
  it("HM-1 the form version is data: the research transcription, every row unverified, eHMIS ids null", () => {
    expect(form.version).toBe("2019-09-print");
    expect(form.verified).toBe(false);
    expect(form.sections.map((s) => s.id)).toEqual([
      "10.1",
      "10.2",
      "10.3",
      "10.4",
      "10.5",
      "10.6",
      "10.7",
      "6",
    ]);
    expect(form.rows.every((r) => r.verified === false && r.hasPositive === null)).toBe(true);
    expect(
      form.rows
        .flatMap((r) => r.cells)
        .every((c) => c.dataElement === null && c.categoryOption === null),
    ).toBe(true);
    const codes = form.rows.map((r) => r.code);
    // Every code the canvas shows (STOP 0 Q3) is in the transcription; VS18 is not.
    for (const c of [
      "HE02",
      "HE04",
      "SR01",
      "SR07",
      "IG04",
      "ML01",
      "PS01",
      "PS02",
      "RP03",
      "RP05",
      "CX03",
      "CX07",
    ])
      expect(codes).toContain(c);
    expect(codes).not.toContain("VS18");
    expect(form.rows.find((r) => r.code === "ML01")!.cells.map((c) => c.column)).toEqual([
      "Number Done",
      "MTB+",
      "RR",
    ]);
    expect(new Set(form.rows.map(rowKey)).size).toBe(form.rows.length);
  });

  it("HM-2 the mapping cannot be signed while the form is unverified, a row is unknown or a menu test is unmapped", () => {
    expect(mappingSignErrors(MAPPING, form, MENU)).toEqual([
      "form_not_verified",
      "unmapped_test:test.lft",
    ]);
    const bad = {
      ...MAPPING,
      rows: [
        ...MAPPING.rows,
        { code: "ZZ99", sources: [{ testCode: "test.lft" }] },
        { code: "HE04", sources: [], positive: [{ column: "Bogus", conceptId: "x", answers: [] }] },
      ],
    };
    expect(mappingSignErrors(bad, { ...form, verified: true }, MENU)).toEqual([
      "unknown_row:ZZ99",
      "unknown_cell:HE04|Bogus",
    ]);
    expect(unmappedTests(MAPPING, MENU)).toEqual(["test.lft"]);
  });

  it("HM-3 count105 on the fixture month equals the reviewed expected output (count105-expected.md)", () => {
    expect(project(sept)).toEqual(expected);
  });

  describe("HM-3 each counting rule on the fixture month", () => {
    it("HM-3 (a) result time in the month, hospital-local; downtime by the form's time; released only", () => {
      expect(sept.cells["HE02|Number Done"]!.sources).toEqual(["fbc-1", "fbc-2", "fbc-4"]);
    });
    it("HM-3 (b) chemistry per analyte; eGFR never", () => {
      expect([
        cell("RP04|Number Done"),
        cell("RP03|Number Done"),
        cell("RP01|Number Done"),
        cell("RP05|Number Done"),
        cell("CX07|Number Done"),
      ]).toEqual([2, 2, 1, 2, 2]);
      expect(sept.cells["CX07|Number Done"]!.sources).toEqual([
        "ue-5:obs.chloride",
        "ue-5:obs.bicarbonate",
      ]);
      expect(JSON.stringify(sept.cells)).not.toContain("egfr");
    });
    it("HM-3 (c) QC and EQA tests are not counted in 10.2; HIV kit controls go to 10.3 IQC", () => {
      expect(cell("RP03|Number Done")).toBe(2);
      expect(cell("PS02|Number Done")).toBe(4);
      expect(cell("Determine|IQC")).toBe(1);
    });
    it("HM-3 (d) a rejected specimen is counted in 10.7 only", () => {
      expect(cell("RS14|Blood")).toBe(1);
      expect(cell("RS01|Urine")).toBe(1);
      expect(sept.cells["HE02|Number Done"]!.sources).not.toContain("sp-6");
    });
    it("HM-3 (e) referred-out tests go to 10.5 by reason, never 10.2", () => {
      expect(cell("test.hiv_viral_load|Equipment break down")).toBe(1);
      expect(cell("test.hiv_viral_load|Others")).toBe(1);
      expect(cell("IG02|Number Done")).toBeNull();
    });
    it("HM-3 (f) outside results are never counted", () => {
      expect(sept.cells["CX07|Number Done"]!.sources.some((s) => s.startsWith("hba1c"))).toBe(
        false,
      );
    });
    it("HM-3 (g) an amended result counts once, as its current version", () => {
      expect(sept.cells["RP03|Number Done"]!.sources).toEqual([
        "ue-5:obs.potassium",
        "ue-7:obs.potassium",
      ]);
      expect(cell("SR01|Number Positive")).toBe(1); // positive from the amended answer
    });
    it("HM-3 (h) bedside tests are counted in their row with the share stored", () => {
      expect(sept.cells["PS02|Number Done"]).toMatchObject({ value: 4, bedside: 2 });
    });
    it("HM-3 (i) blank when not on the menu; 0 when on the menu with none done", () => {
      expect(cell("HE06|Number Done")).toBeNull();
      expect(sept.cells["CX02|Number Done"]).toBeUndefined();
      expect(cell("HE04|Number Done")).toBe(0);
      expect(cell("MB02|Number Done")).toBe(0);
    });
  });

  it("HM-4 10.1 visits are patient × hospital-local day × OPD/IPD by specimen column; SC01 counts specimens", () => {
    expect([
      cell("LV01|Blood"),
      cell("SC01|Blood"),
      cell("LV02|Sputum"),
      cell("LV01|Urine"),
    ]).toEqual([5, 6, 1, 1]);
    expect(sept.cells["SC02|Blood"]).toBeUndefined();
  });

  it("HM-5 10.3 HIV tests by kit × purpose; inconclusive on the last kit; no purpose listed, never guessed", () => {
    expect([cell("Determine|HCT"), cell("Statpak|HCT"), cell("SD Bioline|HCT")]).toEqual([1, 1, 1]);
    expect(cell("Determine|Total")).toBe(2);
    expect(cell("SD Bioline|Inconclusive Results")).toBe(1);
    expect(sept.purposeNotRecorded).toBe(1);
    expect(sept.cells["Determine|Repeat Testers"]).toEqual({ value: 1, sources: [], manual: true });
  });

  it("KQ-6 HIV rapid-test QC events are counted in 10.3 as IQC, by kit", () => {
    expect(cell("Determine|IQC")).toBe(1);
    expect(cell("Statpak|IQC")).toBe(0);
  });

  it("EA-6 HIV EQA panel tests are counted in 10.3 under EQA, by kit", () => {
    expect(cell("Determine|EQA")).toBe(2);
  });

  it("HM-6 10.4 volume is a manual cell until referral tracking", () => {
    expect(sept.cells["VS02|No. of Specimen Referred"]).toEqual({
      value: 2,
      sources: [],
      manual: true,
    });
    expect(sept.manualIgnored).toEqual(["HE02|Number Done"]);
  });

  it("HM-7 10.5 by the availability reason; orders from before the reason count under Others", () => {
    expect(Object.keys(sept.cells).filter((k) => k.startsWith("test.hiv_viral_load"))).toEqual([
      "test.hiv_viral_load|Equipment break down",
      "test.hiv_viral_load|Others",
    ]);
  });

  it("HM-8 10.6 AMR is entered by hand", () => {
    const withAmr = count105({ ...SEPTEMBER, manual: { "AMR|E. coli fixture": 3 } });
    expect(withAmr.cells["AMR|E. coli fixture"]).toEqual({ value: 3, sources: [], manual: true });
  });

  it("HM-9 Section 6 tracer stock: consumed, days out of stock, on hand at month end, expired", () => {
    expect([
      cell("SS07|Quantity consumed"),
      cell("SS07|Days out of stock"),
      cell("SS07|Stock on hand"),
      cell("SS07|Quantity expired"),
    ]).toEqual([15, 0, 82, 3]);
    expect([
      cell("SS11|Quantity consumed"),
      cell("SS11|Days out of stock"),
      cell("SS11|Stock on hand"),
    ]).toEqual([10, 3, 0]);
    expect(sept.cells["SS26|Stock on hand"]).toBeUndefined();
  });

  it("HM-3 two hospitals: hospital B counts only its own rows", () => {
    const b = count105({ ...SEPTEMBER, hospitalId: H2, manual: {} });
    expect(b.cells["HE02|Number Done"]).toEqual({ value: 1, sources: ["fbc-19"] });
    expect(b.cells["LV01|Blood"]?.value).toBe(1);
    expect(b.cells["test.hiv_viral_load|Reagent stock out"]?.value).toBe(1);
    expect(b.cells["Determine|IQC"]?.value).toBe(1);
    expect(b.cells["SS07|Stock on hand"]).toBeUndefined(); // hospital A's tracer item
    expect(b.cells["RS14|Blood"]).toBeUndefined();
  });

  it("HM-10 draft → checked (lead) → signed (In-Charge, fresh second factor) → exported", () => {
    const lead = { isLead: true, isInCharge: false, freshSecondFactor: false };
    const inCharge = { isLead: false, isInCharge: true, freshSecondFactor: true };
    expect(hmisTransition("draft", "checked", lead)).toBeNull();
    expect(hmisTransition("draft", "checked", inCharge)).toBe("not_lead");
    expect(hmisTransition("checked", "signed", inCharge)).toBeNull();
    expect(hmisTransition("checked", "signed", { ...inCharge, freshSecondFactor: false })).toBe(
      "second_factor_not_fresh",
    );
    expect(hmisTransition("checked", "signed", lead)).toBe("not_in_charge");
    expect(hmisTransition("draft", "signed", inCharge)).toBe("not_allowed");
    expect(hmisTransition("signed", "exported", lead)).toBeNull();
    expect(hmisTransition("signed", "draft", lead)).toBe("not_allowed");
  });

  it("HM-11 changed since signing: the cells, old and new, and the records that caused them", () => {
    const later = count105({
      ...SEPTEMBER,
      reports: [
        ...REPORTS,
        // a downtime form dated 28 SEP, entered after signing
        {
          ...REPORTS[0]!,
          id: "fbc-21-v1",
          logicalId: "fbc-21",
          resultAt: kla("2026-10-20 09:00"),
          formResultAt: kla("2026-09-28 10:00"),
        },
        // the RPR corrected again, back to non-reactive
        {
          ...REPORTS.find((r) => r.logicalId === "rpr-8" && r.version === 2)!,
          id: "rpr-8-v3",
          version: 3,
          status: "corrected",
          observations: [{ conceptId: "obs.rpr_result", code: "non_reactive" }],
        },
      ],
    });
    expect(revisionDiff(sept.cells, later.cells)).toEqual([
      { key: "HE02|Number Done", old: 3, new: 4, added: ["fbc-21"], removed: [] },
      { key: "SR01|Number Positive", old: 1, new: 0, added: [], removed: ["rpr-8"] },
    ]);
    expect(revisionDiff(sept.cells, count105(SEPTEMBER).cells)).toEqual([]);
    const blanked: Record<string, Cell> = {
      ...sept.cells,
      "HE04|Number Done": { value: null, sources: [] },
    };
    expect(revisionDiff(sept.cells, blanked)).toEqual([
      { key: "HE04|Number Done", old: 0, new: null, added: [], removed: [] },
    ]);
  });

  it("HM-12 the CSV follows the form's order; blanks absent, zeros present; cells without eHMIS ids listed", () => {
    const withIds: HmisForm = {
      ...form,
      rows: form.rows.map((r) => ({
        ...r,
        cells: r.cells.map((c) => ({
          ...c,
          dataElement: `DE-${rowKey(r)}-fixture`,
          categoryOption: c.column === "Number Done" ? "COC-done-fixture" : "COC-other-fixture",
        })),
      })),
    };
    const { csv, missingIds } = toCsv(withIds, sept.cells, {
      month: "2026-09",
      orgUnit: "OU-fixture",
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("dataElement,categoryOption,value,period,orgUnit");
    expect(lines[1]).toBe("DE-LV01-fixture,COC-other-fixture,5,202609,OU-fixture");
    expect(lines).toContain("DE-HE02-fixture,COC-done-fixture,3,202609,OU-fixture");
    expect(lines).toContain("DE-HE04-fixture,COC-done-fixture,0,202609,OU-fixture");
    expect(csv).not.toContain("DE-HE06");
    expect(csv).not.toContain("DE-CX02");
    expect(missingIds).toEqual([]);
    // The real file has no ids yet: every valued cell on the form is listed, and the CSV is the header alone.
    const real = toCsv(form, sept.cells, { month: "2026-09", orgUnit: "OU-fixture" });
    expect(real.csv).toBe("dataElement,categoryOption,value,period,orgUnit\n");
    expect(real.missingIds).toContain(cellKey("HE02", "Number Done"));
    expect(real.missingIds).not.toContain(cellKey("HE06", "Number Done"));
  });

  it("HM-13 a reminder from the 1st to the 7th while the previous month is unsigned", () => {
    expect(hmisReminder(kla("2026-10-03 09:00"), TZ, [])).toBe("2026-09");
    expect(hmisReminder(kla("2026-10-01 00:30"), TZ, [])).toBe("2026-09"); // 30 SEP 21:30Z
    expect(hmisReminder(kla("2026-09-30 23:59"), TZ, [])).toBeNull();
    expect(hmisReminder(kla("2026-10-07 23:00"), TZ, [])).toBe("2026-09");
    expect(hmisReminder(kla("2026-10-08 00:01"), TZ, [])).toBeNull();
    expect(hmisReminder(kla("2026-10-03 09:00"), TZ, ["2026-09"])).toBeNull();
    expect(hmisReminder(kla("2027-01-02 09:00"), TZ, [])).toBe("2026-12");
  });
});
