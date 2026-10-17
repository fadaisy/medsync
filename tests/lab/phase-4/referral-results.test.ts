import type { UnitRegistry } from "@/lib/lab/referral-results";
import { describe, expect, it } from "vitest";

import {
  compareIdentity,
  componentEntry,
  correctedReport,
  criticalCheckInput,
  electronicLanding,
  flagAgainstPrinted,
  parsePrintedRange,
  provenance,
  provenanceLines,
  releaseErrors,
  secondPersonRule,
  snapshotFields,
} from "@/lib/lab/referral-results";

/**
 * Lab Phase 4 Step 3: results back (RB-1..RB-10, A19, A20). Units, ranges and the conversion are synthetic test
 * values (a ×10 "test-unit" ↔ "test-unit-b" pair), not a real unit or range.
 */
const registry: UnitRegistry = {
  knows: (u) => ["test-unit", "test-unit-b", "test-unit-c"].includes(u),
  toHospital: (v, u) => (u === "test-unit-b" ? v * 10 : null),
  hospitalUnit: "test-unit",
};

describe("RB-2 the identity on the paper", () => {
  const referral = {
    theirNumbers: ["TEST-RL-1"],
    name: "Test Patient Alpha",
    birthDate: "2000-01-01",
  };
  it("RB-2 agrees after normalisation", () => {
    const r = compareIdentity(
      { theirNumber: "test rl 1", name: "ALPHA, Test Patient", birthDate: "01/01/2000" },
      referral,
    );
    expect(r).toMatchObject({ agrees: true, next: "enter" });
  });
  it("S21 RB-2 a different name or date of birth refuses entry and opens reconciliation", () => {
    for (const paper of [
      { theirNumber: "TEST-RL-1", name: "Test Patient Bravo", birthDate: "2000-01-01" },
      { theirNumber: "TEST-RL-1", name: "Test Patient Alpha", birthDate: "2000-01-02" },
      { theirNumber: "TEST-RL-2", name: "Test Patient Alpha", birthDate: "2000-01-01" },
      { theirNumber: "TEST-RL-1", name: "Test Patient Alpha", birthDate: "not a date" },
    ])
      expect(compareIdentity(paper, referral)).toMatchObject({
        agrees: false,
        next: "open_reconciliation",
      });
  });
});

describe("RB-3 value, unit, range and flag as printed", () => {
  it("RB-3 parses the printed range forms; others stay text", () => {
    expect(parsePrintedRange("1.0 – 2.0")).toEqual({ text: "1.0 – 2.0", low: 1, high: 2 });
    expect(parsePrintedRange("1-2")).toEqual({ text: "1-2", low: 1, high: 2 });
    expect(parsePrintedRange("< 5")).toEqual({ text: "< 5", high: 5, bound: "<" });
    expect(parsePrintedRange("≥ 10")).toEqual({ text: "≥ 10", low: 10, bound: ">=" });
    expect(parsePrintedRange("Negative")).toEqual({ text: "Negative" });
    expect(parsePrintedRange("5 - 1")).toEqual({ text: "5 - 1" });
    expect(parsePrintedRange("  ")).toBeNull();
  });

  it("D-LAB4-09 the flag comes from the printed range only", () => {
    const r = parsePrintedRange("1.0 – 2.0");
    expect(flagAgainstPrinted("0.5", r)).toBe("low");
    expect(flagAgainstPrinted("1.5", r)).toBe("normal");
    expect(flagAgainstPrinted("2.5", r)).toBe("high");
    expect(flagAgainstPrinted("<0.5", r)).toBe("low");
    expect(flagAgainstPrinted("<1.5", r)).toBeNull(); // cannot say
    expect(flagAgainstPrinted(">3", r)).toBe("high");
    expect(flagAgainstPrinted("6", parsePrintedRange("< 5"))).toBe("high");
    expect(flagAgainstPrinted("4", parsePrintedRange("< 5"))).toBe("normal");
    expect(flagAgainstPrinted("9", parsePrintedRange("≥ 10"))).toBe("low");
  });

  it("RB-3 a coded result against a text range reads the same or not", () => {
    expect(flagAgainstPrinted("negative", parsePrintedRange("Negative"))).toBe("normal");
    expect(flagAgainstPrinted("Positive", parsePrintedRange("Negative"))).toBe("abnormal");
    expect(flagAgainstPrinted("3", parsePrintedRange("Negative"))).toBeNull();
  });

  it("S23 RB-3 no printed range: no flag, the words say so", () => {
    const e = componentEntry({
      value: "1.5",
      unitAsPrinted: "test-unit",
      rangeAsPrinted: null,
      registry,
    });
    expect(e).toMatchObject({ flag: null, notes: ["No range printed."], blocks: [] });
  });

  it("S22 RB-3 an unknown unit blocks release with the words for the lead", () => {
    const e = componentEntry({
      value: "1.5",
      unitAsPrinted: "odd-unit",
      rangeAsPrinted: "1-2",
      registry,
    });
    expect(e.unitKnown).toBe(false);
    expect(e.blocks).toEqual([
      "odd-unit is not in this hospital's unit list. Ask the laboratory lead to add it.",
    ]);
    expect(releaseErrors({ scanAttached: true, entries: [e] })).toEqual(["unknown_unit"]);
  });

  it("S20 D-LAB4-10 a conversion only through the registry, labelled; the same unit says so", () => {
    expect(
      componentEntry({
        value: "1.5",
        unitAsPrinted: "test-unit-b",
        rangeAsPrinted: "1-2",
        registry,
      }).converted,
    ).toEqual({
      value: 15,
      unit: "test-unit",
    });
    expect(
      componentEntry({ value: "1.5", unitAsPrinted: "test-unit", rangeAsPrinted: "1-2", registry })
        .converted,
    ).toBe("same_unit");
  });
});

describe("RB-5 the critical check", () => {
  it("S24 RB-5 runs on the value in this hospital's unit", () => {
    const same = componentEntry({
      value: "9",
      unitAsPrinted: "test-unit",
      rangeAsPrinted: "1-2",
      registry,
    });
    expect(criticalCheckInput(same)).toEqual({ run: true, value: 9, unit: "test-unit" });
    const conv = componentEntry({
      value: "0.9",
      unitAsPrinted: "test-unit-b",
      rangeAsPrinted: "1-2",
      registry,
    });
    expect(criticalCheckInput(conv)).toEqual({ run: true, value: 9, unit: "test-unit" });
  });

  it("A20 a known unit with no conversion: the check does not run and the lab is told (the result still releases)", () => {
    const e = componentEntry({
      value: "9",
      unitAsPrinted: "test-unit-c",
      rangeAsPrinted: "1-2",
      registry,
    });
    expect(criticalCheckInput(e)).toEqual({
      run: false,
      note: "test-unit-c cannot be converted to this hospital's unit, so the critical check did not run. Read the value against the report and call the ward if it is dangerous.",
    });
    expect(releaseErrors({ scanAttached: true, entries: [e] })).toEqual([]);
  });
});

describe("RB-6, RB-7 the scan and the second person", () => {
  it("RB-6 the scan is required before release", () => {
    const e = componentEntry({
      value: "1.5",
      unitAsPrinted: "test-unit",
      rangeAsPrinted: "1-2",
      registry,
    });
    expect(releaseErrors({ scanAttached: false, entries: [e] })).toEqual(["scan_required"]);
    expect(releaseErrors({ scanAttached: true, entries: [] })).toEqual(["no_components"]);
  });

  it("S25 RB-7 alone on duty → one person; with someone active → needs a checker; a check counts with the scan confirmed", () => {
    const now = new Date("2026-10-17T10:00:00Z");
    const base = {
      enteredBy: "u1",
      checkedBy: null,
      scanConfirmed: false,
      presenceMinutes: 30,
      now,
    };
    expect(secondPersonRule({ ...base, activeOthers: [] })).toBe("one_person");
    expect(
      secondPersonRule({
        ...base,
        activeOthers: [{ userId: "u2", lastActiveAt: new Date("2026-10-17T08:00:00Z") }],
      }),
    ).toBe("one_person");
    expect(
      secondPersonRule({
        ...base,
        activeOthers: [{ userId: "u2", lastActiveAt: new Date("2026-10-17T09:45:00Z") }],
      }),
    ).toBe("needs_checker");
    expect(secondPersonRule({ ...base, activeOthers: [{ userId: "u1", lastActiveAt: now }] })).toBe(
      "one_person",
    );
    expect(
      secondPersonRule({
        ...base,
        checkedBy: "u2",
        scanConfirmed: false,
        activeOthers: [{ userId: "u2", lastActiveAt: now }],
      }),
    ).toBe("needs_checker");
    expect(
      secondPersonRule({ ...base, checkedBy: "u2", scanConfirmed: true, activeOthers: [] }),
    ).toBe("checked");
    expect(
      secondPersonRule({ ...base, checkedBy: "u1", scanConfirmed: true, activeOthers: [] }),
    ).toBe("one_person");
  });
});

describe("RB-8..RB-10 provenance, corrections, electronic results", () => {
  it("RB-8 the doctor's lines for a paper result checked by a second person", () => {
    const p = provenance({
      partner: "Reference lab A (test)",
      theirReport: "TEST-RPT-1",
      authorisedBy: "Senior technologist (test)",
    });
    expect(
      provenanceLines(p, { enteredBy: "LT-A", checkedBy: "LT-B", reportedAt: "12 OCT 2026 16:05" }),
    ).toEqual([
      "Done at Reference lab A (test). Their report TEST-RPT-1, 12 OCT 2026 16:05, authorised by Senior technologist (test). Ranges are theirs, as printed. Entered from the paper report by LT-A, checked by LT-B.",
    ]);
  });

  it("RB-8 one person, filed after a mismatch, cancelled after sending, electronic", () => {
    const p = provenance({
      partner: "Reference lab A (test)",
      oneEntrant: true,
      cancelledAfterSending: true,
      filedAfterMismatch: { method: "phone call", by: "u1", second: "u2" },
    });
    const lines = provenanceLines(p, {});
    expect(lines).toContain("Entered by one person. A second check is due.");
    expect(lines).toContain(
      "Filed by hand after a mismatch, confirmed with Reference lab A (test) by phone call.",
    );
    expect(lines).toContain("Cancelled by the doctor after sending.");
    const e = provenanceLines(
      provenance({ partner: "Reference lab A (test)", messageId: "msg-1" }),
      { filedBy: "LT-A" },
    );
    expect(e).toEqual([
      "From Reference lab A (test)'s system, message msg-1. Ranges are theirs. Filed by LT-A.",
    ]);
  });

  it("RB-4 the snapshot keeps whose range and what was printed", () => {
    const e = componentEntry({
      value: "2.5",
      unitAsPrinted: "test-unit",
      rangeAsPrinted: "1-2",
      registry,
    });
    expect(snapshotFields(e)).toEqual({
      range_source: "performing_lab",
      printed: {
        value: "2.5",
        unit: "test-unit",
        range: "1-2",
        flagText: "high",
        converted: "same_unit",
      },
    });
  });

  it("RB-9 a corrected report keeps the old values and scan; RB-10 an electronic result waits for a person", () => {
    expect(correctedReport()).toEqual({
      path: "amendment",
      keepOldValues: true,
      keepOldScan: true,
    });
    expect(electronicLanding()).toEqual({ state: "back_to_file", releasedWithoutPerson: false });
  });
});
