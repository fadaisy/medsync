import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { bedsideErrors } from "@/lib/lab/bedside";

/**
 * Lab Phase 3, Step 0 (docs/lab/phase-3/PROMPT-LAB-PHASE-3.md §9): failing tests that reproduce the three
 * defects named in the baseline. Each is `it.fails`: green while the defect is present, red once fixed, so the
 * step that fixes it flips it to a plain `it` ((a) Step 6 S18, (b) Step 8 S33, (c) Step 4 S6: flipped).
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
  // (a) No QC exists, so nothing can hold a release: the one write every lab release goes through
  // (`writeReportVersion`, reached by releaseResults, enterResults(final), releaseWithCriticalMark and the
  // downtime form) never asks for the analyser's QC status. With a rejected run on record, release succeeds.
  it.fails(
    "(a) releasing a component whose analyser's latest QC run is rejected is refused on the server",
    () => {
      const results = read("lib/emr/write/results.ts");
      expect(results).toMatch(/qcStatusFor\(/);
      expect(results).toMatch(/held for quality control|qc_held/);
    },
  );

  // (b) A bedside device has no control check, so a device whose check failed is still "in use" and its
  // result is saved. The check below passes the failed check in; the engine has no input for it and returns
  // no error.
  it.fails("(b) a bedside result from a device whose last control check failed is refused", () => {
    const withFailedCheck = { ...ok(), deviceCheck: { last: "failed" } };
    expect(bedsideErrors(withFailedCheck) as string[]).toContain("device_check_failed");
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
