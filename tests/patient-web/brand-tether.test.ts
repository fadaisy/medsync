import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M15: the patient web says Tether. No "MedSync" in any patient string, outside comments, except the
 * data-processing consent lines, which keep the legal text unchanged until the owner re-issues the notice (2.4).
 */
const DIRS = ["content/patient", "content/patient-app"];
const LEGAL = /data-processing notice/;

describe("M15: no MedSync in patient-facing strings", () => {
  for (const dir of DIRS)
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts")))
      it(`${dir}/${f}`, () => {
        const lines = readFileSync(join(dir, f), "utf8").split("\n");
        const bad = lines.filter(
          (l) => l.includes("MedSync") && !/^\s*(\*|\/\/|\/\*)/.test(l) && !LEGAL.test(l),
        );
        expect(bad).toEqual([]);
      });
});
