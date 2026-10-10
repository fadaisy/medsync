import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 1, Step 0 (docs/lab/phase-1/PROMPT-LAB-PHASE-1.md §9): failing tests that reproduce
 * F3, F5 and F9. Each is `it.fails`: green while the defect is present, red once fixed, so the
 * step that fixes it flips it to a plain `it` (F3 in Step 4, F5 in Step 5, F9 in Step 8).
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("Lab Phase 1 baseline — defects reproduced at Step 0", () => {
  it.fails("F3: releasing a critical result creates an alert (fixed in Step 4)", () => {
    // Today releaseResults computes `critical` and returns a warning string; nobody is told.
    const release = read("lib/emr/write/results.ts");
    const engine = existsSync(resolve(ROOT, "lib/lab/criticals"));
    expect(engine).toBe(true);
    expect(release).toMatch(/criticalAlerts|critical_alerts|createCriticalAlert/);
  });

  it.fails("F5: the reference range comes from a signed store, not typed (fixed in Step 5)", () => {
    // Today the technologist types low and high on every result (EntryLine.low/high).
    const view = read("components/emr/results/result-entry-view.tsx");
    expect(view).toMatch(/resolveRange|rangeFromStore/);
  });

  it.fails("F9: a hospital can be switched to one result path (fixed in Step 8)", () => {
    // Today EMR_V1 per hospital chooses the path, and the legacy write actions stay callable.
    const legacy = read("app/lab/actions.ts");
    expect(existsSync(resolve(ROOT, "lib/lab/cutover.ts"))).toBe(true);
    expect(legacy).toMatch(/cutover|legacyWritesClosed/);
  });
});
