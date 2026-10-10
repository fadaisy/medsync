import { describe, expect, it } from "vitest";

import MAP from "@/data/pharmacy/permission-map.v1.json";
import {
  can,
  mapProblems,
  PHARMACY_MAP_CADRES,
  PHARMACY_PERMISSIONS,
  pharmacyAccess,
} from "@/lib/pharmacy/access";

/** Pharmacy Phase 0 — the access engine (PA-1..PA-5; gate-a-proposal §2). */
describe("pharmacy access", () => {
  it("PA-1: six names, one granted", () => {
    expect(PHARMACY_PERMISSIONS).toEqual([
      "pharmacy.view",
      "pharmacy.review",
      "pharmacy.dispense",
      "pharmacy.stock",
      "pharmacy.controlled",
      "pharmacy.manage",
    ]);
    for (const cadre of PHARMACY_MAP_CADRES)
      expect([...pharmacyAccess(cadre).permissions]).toEqual(["pharmacy.view"]);
  });

  it("PA-2: the signed map names the Pharmacist and the Pharmacy technician, and nothing else", () => {
    expect(MAP.status).toBe("signed");
    expect([...PHARMACY_MAP_CADRES].sort()).toEqual(["PHARMACIST", "PHARMACY_TECH"]);
    expect(mapProblems()).toEqual([]);
  });

  it("PA-2: an unsigned map grants nothing", () => {
    const draft = { ...MAP, status: "draft" };
    expect(pharmacyAccess("PHARMACIST", draft).permissions.size).toBe(0);
    expect(mapProblems(draft)).toContain("status is draft, not signed");
  });

  it("PA-1: a reserved name never comes from a map in this phase", () => {
    const greedy = { ...MAP, cadres: { PHARMACIST: [...PHARMACY_PERMISSIONS] } };
    expect([...pharmacyAccess("PHARMACIST", greedy).permissions]).toEqual(["pharmacy.view"]);
    expect(mapProblems(greedy)).toContain("PHARMACIST: pharmacy.dispense cannot come from a cadre");
  });

  it.each([
    "MEDICAL_OFFICER",
    "CLINICAL_OFFICER",
    "NURSE",
    "LAB_TECH",
    "LAB_TECHNOLOGIST",
    "RECEPTION",
    null,
  ])("PA-4, PA-5: %s holds no pharmacy permission", (cadre) => {
    const access = pharmacyAccess(cadre);
    expect(access.permissions.size).toBe(0);
    expect(can(access, "pharmacy.view")).toBe(false);
  });
});
