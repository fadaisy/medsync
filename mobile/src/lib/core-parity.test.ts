/** S8 on the phone: the shared fixture gives exactly the stored results (the web runs the same in Vitest). */
import { runCoreFixture } from "@patient-core/core-parity";
import fx from "@patient-core/fixtures/core-parity.json";

describe("S8 core parity (phone)", () => {
  it("every case matches", () => {
    expect(fx.expected).toHaveLength(fx.cases.length);
    expect(runCoreFixture(fx.cases as never)).toEqual(fx.expected);
  });
});
