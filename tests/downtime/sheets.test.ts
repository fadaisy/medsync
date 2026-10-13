import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DrillRecord, SheetState } from "@/lib/downtime/sheets";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  nextSheetNumbers,
  periodErrors,
  sheetLabel,
  sheetMove,
  withinAPeriod,
} from "@/lib/downtime/sheets";
import * as lab from "@/lib/lab/downtime";

/**
 * The shared downtime module (DT-1 "never two", D-PH1-46, ADR 0271). The lab's own tests in tests/lab
 * run unchanged against `lib/lab/downtime.ts`, which now re-exports and uses this.
 */

const T0 = new Date("2026-10-12T10:00:00Z");
const min = (m: number) => new Date(T0.getTime() + m * 60_000);

describe("DT-1 one module", () => {
  it("DT-1 the lab re-exports the shared functions rather than keeping its own", () => {
    expect(lab.nextFormNumbers).toBe(nextSheetNumbers);
    expect(lab.periodErrors).toBe(periodErrors);
    const src = readFileSync(join(process.cwd(), "lib/lab/downtime.ts"), "utf8");
    expect(src).toMatch(/from "@\/lib\/downtime\/sheets"/);
    expect(src).not.toMatch(/padStart|function nextFormNumbers|function periodErrors/);
  });

  it("DT-1 a period contains an instant or a span, inclusive at both ends", () => {
    const periods = [{ startsAt: min(-120), endsAt: min(-60) }];
    expect(withinAPeriod(periods, min(-120))).toBe(true);
    expect(withinAPeriod(periods, min(-60))).toBe(true);
    expect(withinAPeriod(periods, min(-59))).toBe(false);
    expect(withinAPeriod(periods, min(-100), min(-70))).toBe(true);
    expect(withinAPeriod(periods, min(-100), min(-50))).toBe(false);
    expect(withinAPeriod([], min(-100))).toBe(false);
  });
});

describe("DT-2 sheet numbers", () => {
  it("DT-2 S67 ten sheets: ten numbers after the highest reserved, each printed DS-nnnnn", () => {
    const numbers = nextSheetNumbers(30, 10);
    expect(numbers).toHaveLength(10);
    expect(new Set(numbers).size).toBe(10);
    expect(numbers.map((n) => sheetLabel(n, "pharmacy"))).toEqual([
      "DS-00031",
      "DS-00032",
      "DS-00033",
      "DS-00034",
      "DS-00035",
      "DS-00036",
      "DS-00037",
      "DS-00038",
      "DS-00039",
      "DS-00040",
    ]);
    expect(sheetLabel(31, "lab")).toBe("DT-00031");
  });

  it("DT-2 0128's guard: the lab's moves unchanged; the pharmacy's unused → to_enter | voided, to_enter → complete", () => {
    const states: SheetState[] = ["unused", "entered", "to_enter", "complete", "voided"];
    const allowed = (ws: "lab" | "pharmacy") =>
      states.flatMap((f) => states.filter((t) => sheetMove(f, t, ws)).map((t) => `${f}>${t}`));
    expect(allowed("lab")).toEqual(["unused>entered", "unused>voided"]);
    expect(allowed("pharmacy")).toEqual(["unused>to_enter", "unused>voided", "to_enter>complete"]);
  });
});

describe("DT-11 drills", () => {
  it("DT-11 a drill record has no patient, stock or prescription field", () => {
    expectTypeOf<keyof DrillRecord>().toEqualTypeOf<
      "workspace" | "heldOn" | "participants" | "whatWasDone" | "problems" | "dispensingPointId"
    >();
    const src = readFileSync(join(process.cwd(), "lib/downtime/sheets.ts"), "utf8");
    expect(src).not.toMatch(/from "@\/(db|lib\/emr)|supabase/);
  });
});
