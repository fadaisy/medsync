/** Pharmacy Phase 4, 5.2: the Repeats step reads the typed terms as the server will check them (RP-2). */
import { describe, expect, it, vi } from "vitest";

import { iso, NO_REPEATS, readRepeats } from "@/components/clerking/plan/repeats";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

const b = { offered: ["x"], maxSupplies: 5, maxPeriodDays: 180, minIntervalDays: 7 };
const today = "2026-10-26";
const draft = { on: true, n: "2", d: "28", notAfter: "2027-1-20", reviewBy: "" };

describe("readRepeats", () => {
  it("reads day/month/year boxes into a date, and rejects impossible ones", () => {
    expect(iso("2027-1-20")).toBe("2027-01-20");
    expect(iso("2027-2-30")).toBeNull();
    expect(iso("2027--")).toBeNull();
  });
  it("gives terms inside the signed bounds, and the reason otherwise", () => {
    expect(readRepeats(NO_REPEATS, b, today)).toEqual({ terms: null, error: null });
    expect(readRepeats(draft, b, today).terms).toEqual({
      furtherSupplies: 2,
      minIntervalDays: 28,
      notAfter: "2027-01-20",
      reviewBy: null,
    });
    expect(readRepeats({ ...draft, n: "6" }, b, today).error).toBe("Further supplies: 1 to 5.");
    expect(readRepeats({ ...draft, d: "3" }, b, today).error).toBe("Days apart: at least 7.");
    expect(readRepeats({ ...draft, notAfter: "2028-1-1" }, b, today).error).toMatch(/^Not after/);
    expect(readRepeats({ ...draft, reviewBy: "2027-6-1" }, b, today).error).toMatch(/^Review by/);
  });
});
