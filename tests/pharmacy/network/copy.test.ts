import { describe, expect, it } from "vitest";

import {
  NETWORK_B,
  NETWORK_PARTNER,
  NETWORK_UI,
  PHARMACY_NETWORK_COPY,
  PHARMACY_PARTNER_COPY,
} from "@/content/pharmacy-network";

describe("Phase 4 wording records (CS-5)", () => {
  it("the rework copy sweep returned Steps 2 to 5 to draft for re-signing; the partner side stays draft", () => {
    expect(PHARMACY_NETWORK_COPY).toEqual({
      status: "draft",
      signedBy: null,
      signedOn: null,
    });
    expect(PHARMACY_PARTNER_COPY.status).toBe("draft");
  });

  it("no partner string sits under the signed record", () => {
    const signed = JSON.stringify({ ...NETWORK_B, ...NETWORK_UI }, (_, v) =>
      typeof v === "function" ? v("X", "Y", "Z", "N", "C") : v,
    );
    for (const word of ["consent", "Routed to", "licence", "Partner suspended", "Documents checked"])
      expect(signed, word).not.toContain(word);
    expect(Object.keys(NETWORK_PARTNER)).toContain("consent");
  });
});
