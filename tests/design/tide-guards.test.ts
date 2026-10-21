import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { tideOn } from "@/lib/design/tide";

/**
 * Tide everywhere guards (prompt Step 2). Counts are ratchets from the STOP 0 baseline (21 Oct 2026): they may
 * only fall, and Step 10 sets each to 0. The lab is excluded (D-TW-13). Red reserved: tests/design/red-reserved.test.ts.
 */
const count = (pattern: string) =>
  Number(
    execSync(
      `grep -rEl --include='*.tsx' '${pattern}' app components | grep -v '^app/lab/' | grep -v '^app/styleguide/' | wc -l`,
      { encoding: "utf8" },
    ).trim(),
  );

describe("Tide guards", () => {
  it("no new native date inputs", () => expect(count('type="(date|datetime-local)"')).toBeLessThanOrEqual(37));
  it("no new left-edge state bars", () => expect(count("border-l-(2|4|\\[)")).toBeLessThanOrEqual(4));
  it("no new raw hex in components", () => expect(count("#[0-9a-fA-F]{6}\\b")).toBeLessThanOrEqual(15));
});

describe("TIDE_SURFACES", () => {
  it("is off when unset, on for every group with 1, and per group from a list", () => {
    expect(tideOn("pharmacy", undefined)).toBe(false);
    expect(tideOn("public", "1")).toBe(true);
    expect(tideOn("pharmacy", "pharmacy, doctor")).toBe(true);
    expect(tideOn("nurse", "pharmacy,doctor")).toBe(false);
  });
});
