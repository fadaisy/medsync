/** S8 on the web: the shared fixture gives exactly the stored results (the phone runs the same in Jest). */
import { runCoreFixture } from "@patient-core/core-parity";
import { describe, expect, it } from "vitest";

import fx from "@/packages/patient-core/fixtures/core-parity.json";

describe("S8 core parity (web)", () => {
  it("every case matches", () => {
    expect(fx.expected).toHaveLength(fx.cases.length);
    expect(runCoreFixture(fx.cases)).toEqual(fx.expected);
  });
});
