import type { LabPermission } from "@/lib/lab/access";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NURSE_FEATURE_AREAS } from "@/app/nurse/_lib/features";
import { LAB_PERMISSIONS } from "@/lib/lab/access";
import * as F from "@/lib/lab/feature";
import { navFor } from "@/lib/lab/nav";

/** Law 13: the eight Phase 3 flags and the env variables behind them (gate-a-proposal §13). */
const PHASE3_FLAGS = {
  stock: ["LAB_STOCK", F.labStockLiveFor],
  equipment: ["LAB_EQUIPMENT", F.labEquipmentLiveFor],
  qc: ["LAB_QC", F.labQcLiveFor],
  qcHold: ["LAB_QC_HOLD", F.labQcHoldLiveFor],
  eqa: ["LAB_EQA", F.labEqaLiveFor],
  poctQuality: ["LAB_POCT_QUALITY", F.labPoctQualityLiveFor],
  hmis: ["LAB_HMIS", F.labHmisLiveFor],
  reports: ["LAB_REPORTS", F.labReportsLiveFor],
} as const;
const PHASE2 = [
  "LAB_WORKSPACE",
  "LAB_CRITICALS",
  "LAB_UNITS_RANGES",
  "LAB_DOWNTIME",
  "LAB_CATALOGUE_V2",
  "LAB_ONE_MENU",
  "LAB_PAYMENT",
  "LAB_COLLECTION_CHECK",
  "LAB_BENCH",
  "LAB_HIGH_RISK",
  "LAB_BEDSIDE",
];
const PHASE3_IDS = [
  "stock",
  "equipment",
  "quality",
  "qc",
  "nonconformities",
  "eqa",
  "bedside_quality",
  "register",
  "hmis",
  "reports",
];

/** The nav flags exactly as app/lab/layout.tsx builds them (EMR on), for hospital `h`. */
const layoutFlags = (h: string) => ({
  criticals: false,
  unitsRanges: F.labUnitsRangesLiveFor(h),
  downtime: F.labDowntimeLiveFor(h),
  catalogueV2: F.labCatalogueV2LiveFor(h),
  oneMenu: F.labOneMenuLiveFor(h),
  settings: F.labSettingsLiveFor(h),
  stock: F.labStockLiveFor(h),
  equipment: F.labEquipmentLiveFor(h),
  qc: F.labQcLiveFor(h),
  eqa: F.labEqaLiveFor(h),
  poctQuality: F.labPoctQualityLiveFor(h),
  hmis: F.labHmisLiveFor(h),
  reports: F.labReportsLiveFor(h),
});

/** S50 (navigation): with all eight Phase 3 flags off at a hospital, the lab and nurse menus are Phase 2's. */
describe("S50: all eight Phase 3 flags off", () => {
  afterEach(() => vi.unstubAllEnvs());
  const all = new Set<LabPermission>(LAB_PERMISSIONS);

  it("every Phase 3 flag reads off, and the lab nav lists exactly the Phase 2 items", () => {
    for (const k of PHASE2) vi.stubEnv(k, "1");
    for (const [env] of Object.values(PHASE3_FLAGS)) vi.stubEnv(env, "");
    for (const [env, live] of Object.values(PHASE3_FLAGS)) expect(live("h1"), env).toBe(false);
    const ids = navFor(all, layoutFlags("h1")).map((i) => i.id);
    expect(ids.filter((i) => PHASE3_IDS.includes(i))).toEqual([]);
    // The same list as a nav that has never heard of Phase 3.
    const { stock, equipment, qc, eqa, poctQuality, hmis, reports, ...phase2 } = layoutFlags("h1");
    void [stock, equipment, qc, eqa, poctQuality, hmis, reports];
    expect(ids).toEqual(navFor(all, phase2).map((i) => i.id));
    // The nurse's "Bedside tests" area is behind labPoctQuality alone.
    expect(NURSE_FEATURE_AREAS.find((a) => a.slug === "bedside/devices")?.flag).toBe(
      "poct_quality",
    );
  });

  it("a hospital not in a flag's list keeps Phase 2 while another hospital has Phase 3", () => {
    for (const k of PHASE2) vi.stubEnv(k, "1");
    for (const [env] of Object.values(PHASE3_FLAGS)) vi.stubEnv(env, "h2");
    for (const [env, live] of Object.values(PHASE3_FLAGS)) {
      expect(live("h1"), env).toBe(false);
      expect(live("h2"), env).toBe(true);
    }
    expect(
      navFor(all, layoutFlags("h1"))
        .map((i) => i.id)
        .filter((i) => PHASE3_IDS.includes(i)),
    ).toEqual([]);
    expect(
      navFor(all, layoutFlags("h2"))
        .map((i) => i.id)
        .filter((i) => PHASE3_IDS.includes(i))
        .sort(),
    ).toEqual([...PHASE3_IDS].sort());
  });
});
