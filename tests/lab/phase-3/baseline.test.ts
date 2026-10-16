import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { bedsideErrors } from "@/lib/lab/bedside";
import { evaluateDeviceCheck } from "@/lib/lab/bedside-quality";

/**
 * Lab Phase 3, Step 0 (docs/lab/phase-3/PROMPT-LAB-PHASE-3.md §9): failing tests that reproduce the three
 * defects named in the baseline. Each is `it.fails`: green while the defect is present, red once fixed, so the
 * step that fixes it flips it to a plain `it` ((a) Step 6 S18, (b) Step 8 S33, (c) Step 4 S6: all flipped).
 * Every lot, date and device here is a FIXTURE.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** A bedside input that passes every Phase 2 check (device in use, lot of this device, granted operator). */
const ok = (o: Partial<Parameters<typeof bedsideErrors>[0]> = {}) => {
  const measuredAt = o.measuredAt ?? new Date("2026-10-13T08:00:00Z");
  return {
    device: { state: "in_use", wardId: null, testCode: "test.capillary_glucose" },
    lot: { deviceMatches: true, state: "in_use" as const, useBy: "2099-12-31" },
    operatorGranted: true,
    wardId: null,
    testCode: "test.capillary_glucose",
    measuredAt,
    now: new Date(measuredAt.getTime() + 60_000),
    lateReason: null,
    ...o,
  };
};

describe("Lab Phase 3 baseline — defects reproduced at Step 0", () => {
  // (a) Was: no QC existed, so nothing could hold a release. Fixed at Step 6 (S18): the one write every lab
  // release goes through (`writeReportVersion`, reached by releaseResults, enterResults(final),
  // releaseWithCriticalMark and the downtime form) reads each component's QC status and holds a failed one
  // (tests/emr-db/lab-qc.test.ts proves it on the database).
  it("(a) releasing a component whose analyser's latest QC run is rejected is refused on the server", () => {
    const results = read("lib/emr/write/results.ts");
    expect(results).toMatch(/qcStatusFor\(/);
    expect(results).toMatch(/held for quality control|qc_held/);
  });

  // (b) Was: a bedside device had no control check, so a device whose check failed stayed "in use" and its
  // result was saved. Fixed at Step 8 (S33): a failed check sets the device `blocked` (BQ-2), and every bedside
  // result refuses a blocked device on the server (bedsideErrors and the bedside quality gate;
  // tests/emr-db/lab-bedside-quality.test.ts proves it on the database).
  it("(b) a bedside result from a device whose last control check failed is refused", () => {
    const failed = evaluateDeviceCheck({
      rule: { triggers: ["each_day_of_use"], levels: ["FX-L1"], requiredBeforeUse: false },
      lotRanges: { "FX-L1": { low: 1, high: 2 } },
      observed: { "FX-L1": 3 },
    });
    expect(failed).toMatchObject({ outcome: "fail", deviceState: "blocked" });
    const withFailedCheck = ok({
      device: { state: "blocked", wardId: null, testCode: "test.capillary_glucose" },
    });
    expect(bedsideErrors(withFailedCheck)).toContain("device_blocked");
  });

  // (c) Was: the bedside form listed every lot of the device, expired ones included, and the server compared
  // the UTC date of measurement with the use-by date, so in Kampala (UTC+3) a reading at 01:30 on 14 OCT
  // (22:30 UTC on 13 OCT) passed with a lot whose use-by is 13 OCT. Fixed at Step 4 (S6): the hospital-local
  // day decides, and the form offers only selectable lots, FEFO first.
  it("(c) an expired lot cannot be selected or saved at the bedside", () => {
    const afterMidnightKampala = new Date("2026-10-13T22:30:00Z");
    expect(
      bedsideErrors(
        ok({
          measuredAt: afterMidnightKampala,
          lot: { deviceMatches: true, state: "in_use", useBy: "2026-10-13" },
        }),
      ),
    ).toContain("lot_expired");
    expect(read("app/nurse/patients/[patientId]/bedside/_lib/load.ts")).toMatch(
      /gte\(poctLots\.useBy|usableLots|nextLotToUse/,
    );
  });
});
