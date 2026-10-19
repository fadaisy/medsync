import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  entryStep,
  formTimesProblem,
  PAPER_TIMES_START,
  saveBlock,
} from "@/app/lab/bench/downtime/_lib/steps";

const NOW = "2026-10-19T12:00";

describe("S34 downtime paper-form entry (prompt 5.10, 5.14)", () => {
  it("opens step 2 only after a confirmed patient and order", () => {
    expect(
      entryStep({
        confirmed: false,
        collected: "2026-10-16T08:20",
        resulted: "2026-10-16T09:15",
        nowLocal: NOW,
      }),
    ).toBe(1);
    expect(entryStep({ confirmed: true, collected: "", resulted: "", nowLocal: NOW })).toBe(2);
  });

  it("opens step 3 only after both form times are valid and in order", () => {
    const at = (collected: string, resulted: string) =>
      entryStep({ confirmed: true, collected, resulted, nowLocal: NOW });
    expect(at("2026-10-16T08:20", "")).toBe(2);
    expect(at("2026-10-16T09:20", "2026-10-16T08:15")).toBe(2);
    expect(at("2026-10-16T08:20", "2026-10-20T09:15")).toBe(2);
    expect(at("2026-10-16T08:20", "2026-10-16T08:20")).toBe(3);
    expect(at("2026-10-16T08:20", "2026-10-16T09:15")).toBe(3);
  });

  it("names the time problem", () => {
    expect(formTimesProblem("", "2026-10-16T09:15", NOW)).toBe("missing");
    expect(formTimesProblem("2026-10-16 08:20", "2026-10-16T09:15", NOW)).toBe("missing");
    expect(formTimesProblem("2026-10-16T09:20", "2026-10-16T09:15", NOW)).toBe("order");
    expect(formTimesProblem("2026-10-16T08:20", "2026-10-19T12:01", NOW)).toBe("future");
    expect(formTimesProblem("2026-10-16T08:20", "2026-10-16T09:15", NOW)).toBeNull();
  });

  it("holds Save with the first reason, in the order the paper is filled", () => {
    const ok = {
      formNumber: "412",
      confirmed: true,
      times: null,
      releasedBy: "J. Okello",
      valuesEntered: 1,
    } as const;
    expect(saveBlock(ok)).toBeNull();
    expect(saveBlock({ ...ok, formNumber: "", confirmed: false })).toBe("form");
    expect(saveBlock({ ...ok, confirmed: false })).toBe("patient");
    expect(saveBlock({ ...ok, times: "order" })).toBe("times");
    expect(saveBlock({ ...ok, releasedBy: " J " })).toBe("releasedBy");
    expect(saveBlock({ ...ok, valuesEntered: 0 })).toBe("values");
  });

  it("never defaults a paper-form time", () => {
    expect(Object.values(PAPER_TIMES_START).every((v) => v === "")).toBe(true);
    for (const file of [
      "app/lab/bench/downtime/_components/enter-paper.tsx",
      "app/lab/downtime/_components/enter-form.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      const fields = src.match(/<DateTimeField[\s\S]*?\/>/g) ?? [];
      expect(fields.length).toBeGreaterThanOrEqual(3);
      for (const f of fields) {
        expect(f).toContain("quick={false}");
        expect(f).not.toContain("defaultValue");
      }
      expect(src).not.toMatch(/type="(date|datetime-local|time|month)"/);
    }
  });
});
