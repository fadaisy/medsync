import type { ReadingInput, ReadingLevel } from "@/lib/readings";

import { checkReading } from "@/lib/readings";
import table from "../../../packages/patient-core/fixtures/readings.json";

/** The web runs the same table (tests/patient-core/readings.test.ts): one classifier, one answer. */
const rows = table as { input: ReadingInput; level: ReadingLevel }[];

describe("shared reading threshold edges", () => {
  it.each(rows.map((r) => [JSON.stringify(r.input), r] as const))("%s", (_, r) => {
    expect(checkReading(r.input).level).toBe(r.level);
  });
});
