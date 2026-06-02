import type { ResusDose } from "@/lib/resus/reference/doses";
import { describe, expect, it } from "vitest";

import { RESUS_DOSES } from "@/lib/resus/reference/doses";

/**
 * Clinical-safety guardrails on the dose-currency table (GATE C):
 *   - "never ship a remembered dose" — a FIXED constant must be
 *     web-verified and cite a source;
 *   - a CATEGORY-level item must carry NO fixed mg (the clinician doses);
 *   - paediatric guidance must never be a bare adult number.
 */

const all: ResusDose[] = Object.values(RESUS_DOSES);

describe("resus dose table integrity", () => {
  it("every dose has a source and a paediatric note", () => {
    for (const d of all) {
      expect(d.source, `${d.id} source`).toBeTruthy();
      expect(d.paediatricNote, `${d.id} paediatricNote`).toBeTruthy();
    }
  });

  it("FIXED-tier doses are web-verified and carry an adult value", () => {
    for (const d of all.filter((x) => x.tier === "fixed")) {
      expect(d.adultDose, `${d.id} must state an adult dose`).toBeTruthy();
      expect(d.confidence, `${d.id} must be web-verified to ship as a constant`).toBe(
        "verified-web",
      );
    }
  });

  it("CATEGORY-tier doses carry NO fixed adult mg (clinician doses)", () => {
    for (const d of all.filter((x) => x.tier === "category")) {
      expect(d.adultDose, `${d.id} category-level must not pin an adult dose`).toBeNull();
    }
  });

  it("protocol-surfaced doses do not hard-code an adult dose (only timing)", () => {
    for (const d of all.filter((x) => x.tier === "protocol_surfaced")) {
      expect(
        d.adultDose,
        `${d.id} must surface the dose from the protocol, not hard-code it`,
      ).toBeNull();
      expect(d.timing, `${d.id} should still pin the time-critical fact`).toBeTruthy();
    }
  });

  it("the anaphylaxis adrenaline constant is the verified 500 micrograms IM, repeat 5 min", () => {
    const a = RESUS_DOSES.anaphylaxis_adrenaline_im;
    expect(a.adultDose).toMatch(/500 micrograms/);
    expect(a.adultDose).toMatch(/IM/);
    expect(a.timing).toMatch(/5 min/);
    expect(a.confidence).toBe("verified-web");
  });
});
