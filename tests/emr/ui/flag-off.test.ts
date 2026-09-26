import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { emrV1LiveFor } from "@/lib/emr/feature";

/**
 * Flag off, the pre-EMR pages render exactly as before (UI-BRIEF §6). Two halves:
 * the flag reads false when EMR_V1 is unset, and on each page every EMR identifier
 * sits inside the one `if (emrV1LiveFor(…))` early return, so the code below it is
 * the pre-EMR page.
 */
const PAGES: Record<string, readonly string[]> = {
  "app/doctor/patients/[patientId]/page.tsx": ["EmrChart", "loadChart"],
  "app/nurse/patients/[patientId]/page.tsx": ["EmrChart", "loadChart"],
  "app/doctor/encounters/[encounterId]/page.tsx": ["DeskPage"],
  "app/lab/page.tsx": ["EmrLabWorklist"],
};

/** The source with its import lines and the gated early return cut out. */
function outsideGate(src: string): string {
  const body = src.replace(/^import[\s\S]*?;$/gm, "");
  const at = body.indexOf("if (emrV1LiveFor(");
  expect(at).toBeGreaterThan(-1);
  let i = body.indexOf("))", at) + 1; // the end of `if (emrV1LiveFor(…))`
  // The gate is either `if (…) return …;` or `if (…) { … }`.
  const rest = body.slice(i + 1).trimStart();
  if (rest.startsWith("{")) {
    let depth = 0;
    for (i = body.indexOf("{", i); i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}" && --depth === 0) break;
    }
  } else i = body.indexOf(";", i);
  return body.slice(0, at) + body.slice(i + 1);
}

describe("EMR v1 flag off", () => {
  const saved = { emr: process.env.EMR_V1, engine: process.env.ENCOUNTER_ENGINE_LIVE };
  afterEach(() => {
    process.env.EMR_V1 = saved.emr;
    process.env.ENCOUNTER_ENGINE_LIVE = saved.engine;
    if (saved.emr === undefined) delete process.env.EMR_V1;
    if (saved.engine === undefined) delete process.env.ENCOUNTER_ENGINE_LIVE;
  });

  it("emrV1LiveFor is false with EMR_V1 unset, even with the encounter engine on", () => {
    delete process.env.EMR_V1;
    process.env.ENCOUNTER_ENGINE_LIVE = "1";
    expect(emrV1LiveFor("h-1")).toBe(false);
    process.env.EMR_V1 = "h-2";
    expect(emrV1LiveFor("h-1")).toBe(false);
  });

  for (const [page, names] of Object.entries(PAGES)) {
    it(`${page}: every EMR identifier is behind the one early return`, () => {
      const src = readFileSync(resolve(process.cwd(), page), "utf8");
      expect(src.match(/emrV1LiveFor\(/g)).toHaveLength(1);
      const rest = outsideGate(src);
      for (const n of names) expect(rest, n).not.toMatch(new RegExp(`\\b${n}\\b`));
    });
  }
});
