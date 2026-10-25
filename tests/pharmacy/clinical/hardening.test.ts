import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planAware } from "@/lib/pharmacy/clinical/content";
import {
  anyClinicalLiveFor,
  pharmacyInteractionsLiveFor,
  pharmacyInterventionReviewLiveFor,
  pharmacyReactionsLiveFor,
  pharmacyReconciliationLiveFor,
  pharmacyStewardshipLiveFor,
} from "@/lib/pharmacy/feature";
import { CLINICAL_NAV_IDS, pharmacyNavFor } from "@/lib/pharmacy/nav";

const FLAGS = [
  "PHARMACY_INTERACTIONS",
  "PHARMACY_INTERVENTION_REVIEW",
  "PHARMACY_STEWARDSHIP",
  "PHARMACY_REACTIONS",
  "PHARMACY_RECONCILIATION",
];

describe("Pharmacy Phase 3 hardening (Step 10)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("S48: with all five flags off, no Phase 3 part is live and the nav has no Clinical item", () => {
    for (const f of FLAGS) vi.stubEnv(f, "");
    const h = "11111111-1111-4111-8111-111111111111";
    expect(
      [
        pharmacyInteractionsLiveFor,
        pharmacyInterventionReviewLiveFor,
        pharmacyStewardshipLiveFor,
        pharmacyReactionsLiveFor,
        pharmacyReconciliationLiveFor,
        anyClinicalLiveFor,
      ].map((fn) => fn(h)),
    ).toEqual([false, false, false, false, false, false]);
    const all = new Set([
      "pharmacy.view",
      "pharmacy.review",
      "pharmacy.dispense",
      "pharmacy.manage",
    ] as const);
    const nav = pharmacyNavFor(all, {
      dispensing: true,
      downtime: true,
      clinical: {
        interactions: false,
        interventionReview: false,
        stewardship: false,
        reactions: false,
        reconciliation: false,
      },
    });
    expect(nav.filter((i) => CLINICAL_NAV_IDS.includes(i.id))).toEqual([]);
  });

  it("no write in this slice touches a prescription (the EMR writers it added included)", () => {
    for (const f of [
      "lib/emr/write/reactions.ts",
      "lib/emr/write/home-medicines.ts",
      "lib/pharmacy/clinical/reaction-store.ts",
      "lib/pharmacy/clinical/reconciliation-store.ts",
      "lib/pharmacy/clinical/store.ts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/\.(insert|update|delete)\(prescriptions\)/);
    }
  });

  it("H3-14 / AM-0: AWaRe tags only on an exact generic match; a combination or unknown group is listed, never guessed", () => {
    const meds = [
      { id: "amoxicillin", generic: "Amoxicillin" },
      { id: "co_amoxiclav", generic: "Amoxicillin + clavulanic acid" },
    ];
    const p = planAware(
      [
        { inn: "amoxicillin", aware: "Access" },
        { inn: "Amoxicillin/clavulanic-acid", aware: "Access" },
        { inn: "Amoxicillin + clavulanic acid", aware: "Not recommended" },
      ],
      meds,
      "Fixture edition",
    );
    expect(p.tags).toEqual({ amoxicillin: "Access" });
    expect(p.unmatched).toEqual(["Amoxicillin/clavulanic-acid", "Amoxicillin + clavulanic acid"]);
  });
});
