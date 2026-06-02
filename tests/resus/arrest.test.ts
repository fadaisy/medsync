import { describe, expect, it } from "vitest";

import { detectArrest } from "@/lib/resus/arrest";

/**
 * Arrest-detection seam (GATE E). The ONLY arrest logic in scope: detect
 * → prompt CPR → route to the ALS module. No rhythm/defib/drug logic.
 * Criterion (RCUK/ERC): unresponsive AND (not breathing normally — agonal
 * gasps count as not breathing — and/or no central pulse).
 */

describe("detectArrest", () => {
  it("is not arrest for a responsive patient", () => {
    expect(
      detectArrest({ responsive: true, breathingNormally: false, centralPulse: false }).isArrest,
    ).toBe(false);
  });

  it("is arrest when unresponsive and not breathing normally", () => {
    const r = detectArrest({ responsive: false, breathingNormally: false, centralPulse: null });
    expect(r.isArrest).toBe(true);
    expect(r.reason).toMatch(/breathing/i);
  });

  it("is arrest when unresponsive with no central pulse", () => {
    const r = detectArrest({ responsive: false, breathingNormally: null, centralPulse: false });
    expect(r.isArrest).toBe(true);
    expect(r.reason).toMatch(/pulse/i);
  });

  it("is not arrest when unresponsive but breathing normally with a pulse", () => {
    expect(
      detectArrest({ responsive: false, breathingNormally: true, centralPulse: true }).isArrest,
    ).toBe(false);
  });

  it("is not arrest when there is too little information", () => {
    expect(detectArrest({}).isArrest).toBe(false);
  });
});
