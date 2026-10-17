import {
  barsFor,
  deskCode,
  feeText,
  monthGrid,
  ordinal,
  partOf,
  payLook,
  shiftMonth,
  shortestLine,
  yourNumber,
} from "@/features/visits/logic";

describe("line maths", () => {
  it("your number is the people ahead plus one", () => {
    expect(yourNumber(0)).toBe(1);
    expect(yourNumber(5)).toBe(6);
    expect(yourNumber(13)).toBe(14);
  });

  it("any doctor is the shortest line, first on a tie", () => {
    const lines = [
      { id: "a", ahead: 5 },
      { id: "b", ahead: 2 },
      { id: "c", ahead: 2 },
    ];
    expect(shortestLine(lines)?.id).toBe("b");
    expect(yourNumber(shortestLine(lines)!.ahead)).toBe(3);
    expect(shortestLine([])).toBeNull();
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
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "14th",
      "21st",
      "22nd",
      "112th",
    ]);
  });

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

  it("codes and bars are stable for the same id", () => {
    expect(deskCode("KWP", "abc")).toBe(deskCode("KWP", "abc"));
    expect(deskCode("KWP", "abc")).toMatch(/^KWP-\d{4}$/);
    expect(barsFor("KWP-4827")).toEqual(barsFor("KWP-4827"));
    expect(barsFor("KWP-4827").every((b) => b.x + b.w <= 230)).toBe(true);
  });
});
