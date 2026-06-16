import { describe, expect, it } from "vitest";

import {
  expectedFeaturesFor,
  reconcileDiagnosis,
  reconcileFeatures,
} from "@/lib/clerkship/diagnosis/reconcile";

describe("expectedFeaturesFor", () => {
  it("resolves an NCD's supports (Type 2 diabetes) from the NCD catalog", () => {
    const e = expectedFeaturesFor("Type 2 diabetes mellitus");
    expect(e.symptomCodes).toContain("polyuria_polydipsia");
    expect(e.riskCodes.length).toBeGreaterThan(0);
  });

  it("resolves an acute dx's supports from the maps-derived catalog (ROS symptom codes)", () => {
    const e = expectedFeaturesFor("Pulmonary embolism");
    expect(e.symptomCodes.length).toBeGreaterThan(0);
  });

  it("returns empty for a free-typed diagnosis not in any catalog", () => {
    expect(expectedFeaturesFor("Totally made-up dx")).toEqual({ symptomCodes: [], riskCodes: [] });
  });
});

describe("reconcileFeatures — present (auto) vs missing (blank)", () => {
  it("marks captured features present and uncaptured ones missing", () => {
    const r = reconcileFeatures(
      {
        symptomCodes: ["polyuria_polydipsia", "weight_loss", "fatigue"],
        riskCodes: ["hypertension"],
      },
      { symptomCodes: new Set(["polyuria_polydipsia", "fatigue"]), conditionCodes: new Set() },
    );
    expect(r.symptoms.find((s) => s.code === "polyuria_polydipsia")!.present).toBe(true);
    expect(r.symptoms.find((s) => s.code === "fatigue")!.present).toBe(true);
    expect(r.symptoms.find((s) => s.code === "weight_loss")!.present).toBe(false); // missing → blank
    expect(r.risks.find((s) => s.code === "hypertension")!.present).toBe(false);
  });

  it("never fabricates — a missing feature stays missing (not auto-added)", () => {
    const r = reconcileFeatures(
      { symptomCodes: ["polyphagia"], riskCodes: [] },
      { symptomCodes: new Set(), conditionCodes: new Set() },
    );
    expect(r.symptoms).toEqual([{ code: "polyphagia", present: false }]);
  });

  it("de-duplicates expected codes", () => {
    const r = reconcileFeatures(
      { symptomCodes: ["fatigue", "fatigue"], riskCodes: [] },
      { symptomCodes: new Set(["fatigue"]), conditionCodes: new Set() },
    );
    expect(r.symptoms).toHaveLength(1);
  });
});

describe("reconcileDiagnosis (by display)", () => {
  it("reconciles a real NCD against captured codes", () => {
    const r = reconcileDiagnosis("Type 2 diabetes mellitus", {
      symptomCodes: new Set(["polyuria_polydipsia"]),
      conditionCodes: new Set(),
    });
    const pu = r.symptoms.find((s) => s.code === "polyuria_polydipsia");
    expect(pu?.present).toBe(true);
    expect(r.symptoms.some((s) => !s.present)).toBe(true); // some still missing
  });
});
