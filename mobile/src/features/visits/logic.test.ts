import type { FeeInputs } from "@shared/fees";

import {
  aheadWords,
  countdownOf,
  feeFor,
  feeText,
  monthGrid,
  partOf,
  payLook,
  shiftMonth,
} from "@/features/visits/logic";

describe("ahead of you (ADR 0084 §6)", () => {
  it("shows the count only once the patient is present", () => {
    expect(aheadWords("arrived", 3)).toBe("3 ahead of you");
    expect(aheadWords("awaiting_triage", 1)).toBe("1 ahead of you");
    expect(aheadWords("arrived", 0)).toBe("No one is ahead of you.");
  });

  it("says nothing for a declared place, a seen patient or no status", () => {
    expect(aheadWords("declared", 3)).toBeNull();
    expect(aheadWords("triaged", 3)).toBeNull();
    expect(aheadWords(null, 3)).toBeNull();
  });

  it("hides the count when the read failed or is not a count", () => {
    expect(aheadWords("arrived", null)).toBeNull();
    expect(aheadWords("arrived", -1)).toBeNull();
    expect(aheadWords("arrived", 2.5)).toBeNull();
  });

  it("is never an ordinal, a total or a wait", () => {
    const words = aheadWords("arrived", 12) ?? "";
    expect(words).not.toMatch(/#|\b\d+(st|nd|rd|th)\b|number|of \d|min|hour/i);
  });
});

describe("department fees", () => {
  const line = (departmentId: string, fee: Partial<FeeInputs>) => ({
    departmentId,
    fee: { posture: "full", baseFeeUgx: 30000, lineName: "OPD", cadreFees: [], ...fee },
  });

  it("no priced line is no fee, never a guess", () => {
    expect(feeFor([], "d1", null)).toEqual({ fee: null, feeLabel: null });
    expect(feeFor([line("d1", { posture: "none" })], "d1", null)).toEqual({
      fee: null,
      feeLabel: null,
    });
    expect(feeFor([line("d2", {})], "d1", null)).toEqual({ fee: null, feeLabel: null });
  });

  it("one amount is one number", () => {
    expect(feeFor([line("d1", {})], "d1", null)).toEqual({ fee: 30000, feeLabel: null });
  });

  it("a known cadre resolves its own override", () => {
    const l = line("d1", {
      cadreFees: [{ cadreId: "c1", cadreName: "Consultant", feeUgx: 50000 }],
    });
    expect(feeFor([l], "d1", "c1")).toEqual({ fee: 50000, feeLabel: null });
    expect(feeFor([l], "d1", "c2")).toEqual({ fee: 30000, feeLabel: null });
  });

  it("an unknown clinician spans the range, in words", () => {
    const l = line("d1", {
      cadreFees: [{ cadreId: "c1", cadreName: "Consultant", feeUgx: 50000 }],
    });
    expect(feeFor([l], "d1", null)).toEqual({
      fee: 30000,
      feeLabel: "UGX 30,000 to UGX 50,000",
    });
  });
});

describe("ticket payment look", () => {
  it("no fee is the quiet strip, paid or not", () => {
    expect(payLook(null, false)).toBe("free");
    expect(payLook(0, true)).toBe("free");
  });
  it("a fee not paid is owed; paid is paid", () => {
    expect(payLook(30000, false)).toBe("owed");
    expect(payLook(30000, true)).toBe("paid");
  });
  it("public services say No fee", () => {
    expect(feeText(null)).toBe("No fee");
    expect(feeText(30000)).toBe("UGX 30,000");
  });
});

describe("words and grids", () => {
  it("October 2026 starts on a Thursday and fills whole weeks", () => {
    const g = monthGrid("2026-10-17");
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(g.filter(Boolean)).toHaveLength(31);
  });

  it("months step across the year", () => {
    expect(shiftMonth("2026-12-09", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
  });

  it("splits the day at Kampala noon", () => {
    expect(partOf("2026-10-20T05:00:00Z")).toBe("Morning"); // 08:00 EAT
    expect(partOf("2026-10-20T10:00:00Z")).toBe("Afternoon"); // 13:00 EAT
  });
});

describe("countdownOf", () => {
  const now = new Date("2026-10-18T06:30:00Z");
  it("splits the time left into days, hours and minutes", () => {
    expect(countdownOf(now, "2026-10-19T09:50:00Z")).toEqual({ days: 1, hours: 3, minutes: 20 });
    expect(countdownOf(now, "2026-10-18T07:15:30Z")).toEqual({ days: 0, hours: 0, minutes: 45 });
  });
  it("stops at zero once the time has passed", () => {
    expect(countdownOf(now, "2026-10-18T06:00:00Z")).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
