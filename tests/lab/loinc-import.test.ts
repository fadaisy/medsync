import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** UN-7: the LOINC import keeps active laboratory terms only, and parses quoted CSV fields. Fixture codes. */
describe("LOINC import (dry run)", () => {
  it("counts active laboratory terms and writes nothing", () => {
    const out = execFileSync(
      "node",
      [
        "--experimental-strip-types",
        "scripts/lab/import-loinc.ts",
        resolve("tests/lab/fixtures/loinc-sample.csv"),
        "fixture-1",
      ],
      { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } },
    );
    expect(out).toContain("2 active laboratory terms in LOINC fixture-1 (of 4 rows).");
    expect(out).toContain("Dry run. Nothing written.");
  });
});
