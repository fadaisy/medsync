import type { ReadingInput, ReadingLevel } from "@patient-core/readings";
import { checkReading } from "@patient-core/readings";
import { describe, expect, it } from "vitest";

import table from "../../packages/patient-core/fixtures/readings.json";

/** The same table runs in the phone's jest (mobile/src/lib/readings.shared.test.ts). */
const rows = table as { input: ReadingInput; level: ReadingLevel }[];

describe("@patient-core/readings threshold edges", () => {
  it.each(rows.map((r) => [JSON.stringify(r.input), r] as const))("%s", (_, r) => {
    expect(checkReading(r.input).level).toBe(r.level);
  });
});
