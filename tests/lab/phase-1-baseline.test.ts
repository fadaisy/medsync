import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 1, Step 0 (docs/lab/phase-1/PROMPT-LAB-PHASE-1.md §9): failing tests that reproduce
 * F3, F5 and F9. Each was `it.fails`: green while the defect is present, red once fixed, so the
 * step that fixes it flips it to a plain `it` (F3 in Step 4, F5 in Step 5, F9 in Step 8).
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("Lab Phase 1 baseline — defects reproduced at Step 0", () => {
  it("F3: releasing a result marked critical creates an alert (fixed in Step 4)", () => {
    // The release, its marks and its alert are one transaction in the criticals store; the lab's
    // entry calls it, and an amendment opens the correction alert. Behaviour: tests/emr-db/lab-criticals.test.ts S1.
    const store = read("lib/lab/criticals/store.ts");
    expect(store).toMatch(
      /export async function releaseWithCriticalMark[\s\S]*createAlertOnRelease/,
    );
    expect(read("app/lab/results/[orderId]/_components/lab-result-entry.tsx")).toMatch(
      /releaseWithCriticalMarkAction/,
    );
    expect(read("lib/emr/actions/results.ts")).toMatch(/correctAlerts/);
  });

  it("F5: the reference range comes from a signed store, not typed (fixed in Step 5)", () => {
    // With LAB_UNITS_RANGES on, the write resolves the signed band at collection and snapshots it;
    // the screen shows the same band. Behaviour: tests/emr-db/lab-units.test.ts S23–S25.
    expect(read("lib/lab/units.ts")).toMatch(/resolveRange\(/);
    expect(read("lib/lab/units-read.ts")).toMatch(/resolveRange\(/);
    expect(read("lib/emr/write/results.ts")).toMatch(/prepareFixedUnits/);
    expect(read("components/emr/results/result-entry-view.tsx")).toMatch(/FixedQuantityRow/);
  });

  it("F9: a hospital can be switched to one result path (fixed in Step 8)", () => {
    // The switch is a row in lab_cutover; once it is live each legacy write refuses. Behaviour:
    // tests/emr-db/lab-cutover.test.ts S45–S48.
    expect(existsSync(resolve(ROOT, "lib/lab/cutover.ts"))).toBe(true);
    const legacy = read("app/lab/actions.ts");
    expect(legacy).toMatch(/import \{ legacyWritesOpen \} from "@\/lib\/lab\/cutover-store"/);
    expect(legacy.match(/if \(!\(await legacyWritesOpen\(scope\.hospitalId\)\)\)/g)).toHaveLength(
      3,
    );
  });
});
