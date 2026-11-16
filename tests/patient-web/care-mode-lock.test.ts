import { describe, expect, it } from "vitest";

import { careModeOn, GATE_CG_SIGNED } from "@/lib/patient-web/flags";

describe("MR11: Care mode on the web stays off until Gate CG is signed", () => {
  it("the environment alone cannot turn it on", () => {
    expect(GATE_CG_SIGNED).toBe(false);
    expect(careModeOn("appV2Web,careMode")).toBe(false);
    expect(careModeOn("")).toBe(false);
  });
});
