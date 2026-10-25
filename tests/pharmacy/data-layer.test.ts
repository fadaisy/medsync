import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PHARMACY_PHASE1_COPY_STATUS } from "@/content/pharmacy";
import { NATIONAL_LIST_COPY } from "@/content/pharmacy-catalogue";
import {
  dispensingMap,
  mapV2Problems,
  PHARMACY_MAP_V2,
  pharmacyAccess,
  pharmacyDispensingAccess,
} from "@/lib/pharmacy/access";
import {
  pharmacyDispensingLiveFor,
  pharmacyDowntimeLiveFor,
  pharmacyNationalListLiveFor,
  pharmacyPatientListLiveFor,
  pharmacyStockAnswerLiveFor,
} from "@/lib/pharmacy/feature";
import { matchNationalList, parseCsv } from "@/lib/pharmacy/national-list";

/** Pharmacy Phase 1, Step 2: the permission map v2, the four flags, the national list dry run. */
describe("permission map v2 (D-PH1-03, PA2-1, PA2-2)", () => {
  it("is well formed and grants manage to no cadre", () => {
    expect(mapV2Problems()).toEqual([]);
    for (const ps of Object.values(PHARMACY_MAP_V2.cadres))
      expect(ps).not.toContain("pharmacy.manage");
  });

  it("gives review and controlled to the pharmacist only; a technician dispenses and keeps stock", () => {
    const pharmacist = pharmacyDispensingAccess("PHARMACIST", PHARMACY_MAP_V2).permissions;
    const tech = pharmacyDispensingAccess("PHARMACY_TECH", PHARMACY_MAP_V2).permissions;
    expect([...pharmacist].sort()).toEqual(
      [
        "pharmacy.controlled",
        "pharmacy.dispense",
        "pharmacy.review",
        "pharmacy.stock",
        "pharmacy.view",
      ].sort(),
    );
    expect([...tech].sort()).toEqual(
      ["pharmacy.dispense", "pharmacy.stock", "pharmacy.view"].sort(),
    );
    expect(pharmacyDispensingAccess("NURSE", PHARMACY_MAP_V2).permissions.size).toBe(0);
  });

  it("is provisional: production keeps v1 until legal question 1 is answered", () => {
    expect(dispensingMap("production").version).toBe("1.0.0");
    expect(dispensingMap("preview").version).toBe("2.0.0");
    expect(dispensingMap(undefined).version).toBe("2.0.0");
    const inProd = pharmacyDispensingAccess("PHARMACIST", dispensingMap("production")).permissions;
    expect([...inProd]).toEqual(["pharmacy.view"]);
  });

  it("ADR 0394: production uses v2 only for hospitals named in PHARMACY_DEV_HOSPITALS", () => {
    const list = "h-test, h-other";
    expect(dispensingMap("production", "h-test", list).version).toBe("2.0.0");
    expect(dispensingMap("production", "h-real", list).version).toBe("1.0.0");
    expect(dispensingMap("production", null, list).version).toBe("1.0.0");
    expect(dispensingMap("production", "h-test", undefined).version).toBe("1.0.0");
    expect(dispensingMap("production", "h-test", "1").version).toBe("1.0.0");
  });

  it("leaves Phase 0's access on v1 everywhere", () => {
    expect([...pharmacyAccess("PHARMACIST").permissions]).toEqual(["pharmacy.view"]);
  });

  it("matches the cadre list in 0122's SQL helper", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/0122_pharmacy_foundations.sql"),
      "utf8",
    );
    for (const [cadre, ps] of Object.entries(PHARMACY_MAP_V2.cadres)) {
      const m = sql.match(new RegExp(`WHEN '${cadre}' THEN ARRAY\\[([^\\]]*)\\]`));
      expect(m, cadre).not.toBeNull();
      expect(new Set([...m![1]!.matchAll(/'([a-z.]+)'/g)].map((x) => x[1]))).toEqual(new Set(ps));
    }
  });
});

describe("the four Phase 1 flags (Law 15, RD-4)", () => {
  const H = "11111111-1111-4111-8111-111111111111";
  const flags = [
    ["PHARMACY_DISPENSING", pharmacyDispensingLiveFor],
    ["PHARMACY_STOCK_ANSWER", pharmacyStockAnswerLiveFor],
    ["PHARMACY_PATIENT_LIST", pharmacyPatientListLiveFor],
    ["PHARMACY_DOWNTIME", pharmacyDowntimeLiveFor],
  ] as const;
  afterEach(() => vi.unstubAllEnvs());

  it.each(flags)("%s is off by default and needs the workspace on", (name, live) => {
    expect(live(H)).toBe(false);
    vi.stubEnv(name, "1");
    expect(live(H)).toBe(false);
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    expect(live(H)).toBe(true);
    expect(live("22222222-2222-4222-8222-222222222222")).toBe(true);
    vi.stubEnv(name, H);
    expect(live("22222222-2222-4222-8222-222222222222")).toBe(false);
  });

  it.each(flags)("%s stays off in production while the Phase 1 wording is draft", (name, live) => {
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    vi.stubEnv(name, "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const was = { ...PHARMACY_PHASE1_COPY_STATUS };
    Object.assign(PHARMACY_PHASE1_COPY_STATUS, { status: "draft", signedBy: null, signedOn: null });
    try {
      expect(live(H)).toBe(false);
    } finally {
      Object.assign(PHARMACY_PHASE1_COPY_STATUS, was);
    }
  });

  it.each(flags)("%s can be switched on in production now the wording is signed", (name, live) => {
    expect(PHARMACY_PHASE1_COPY_STATUS).toMatchObject({ status: "signed", signedOn: "2026-10-13" });
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    vi.stubEnv(name, "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(live(H)).toBe(true);
  });
});

describe("the national list page's gate (ADR 0282)", () => {
  const H = "11111111-1111-4111-8111-111111111111";
  afterEach(() => vi.unstubAllEnvs());

  it("follows PHARMACY_DISPENSING, and in production needs its own wording signed", () => {
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    expect(pharmacyNationalListLiveFor(H)).toBe(false);
    vi.stubEnv("PHARMACY_DISPENSING", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(NATIONAL_LIST_COPY).toMatchObject({ status: "signed", signedOn: "2026-10-13" });
    expect(pharmacyNationalListLiveFor(H)).toBe(true);
    const was = { ...NATIONAL_LIST_COPY };
    Object.assign(NATIONAL_LIST_COPY, { status: "draft", signedBy: null, signedOn: null });
    try {
      expect(pharmacyNationalListLiveFor(H)).toBe(false);
    } finally {
      Object.assign(NATIONAL_LIST_COPY, was);
    }
  });
});

describe("the national list dry run (CT-3)", () => {
  const catalogue = [
    { id: "fixture_a", generic: "Fixture-acid" },
    { id: "fixture_b_5", generic: "Fixture base" },
    { id: "fixture_b_10", generic: "Fixture  base" },
  ];
  const csv = [
    "generic_name,form,strength,level_of_care,ven_class,therapeutic_class",
    'FIXTURE ACID,tablet,"[S1], scored",HC4,V,Fixture class',
    "fixture base,infusion,[S2],HC3,E,",
    "Fixture other,capsule,[S3],HC2,N,",
    ",tablet,[S4],HC2,V,",
    "Fixture odd,tablet,[S5],HC2,X,",
  ].join("\r\n");

  it("reads quoted fields, proposes one-to-one names only, and never compares strength", () => {
    const r = matchNationalList(csv, catalogue);
    expect(r.rows).toBe(3);
    expect(r.proposed.map((p) => [p.row.line, p.medicineId])).toEqual([[2, "fixture_a"]]);
    expect(r.proposed[0]!.row.strength).toBe("[S1], scored");
    expect(r.ambiguous.map((a) => a.medicineIds)).toEqual([["fixture_b_5", "fixture_b_10"]]);
    expect(r.unmatched.map((u) => u.genericName)).toEqual(["Fixture other"]);
    expect(r.rejected).toEqual([
      { line: 5, reason: "no generic name" },
      { line: 6, reason: 'class "X" is not V, E or N' },
    ]);
  });

  it("refuses a file without the expected columns", () => {
    expect(matchNationalList("name,form\nx,y", catalogue).rejected[0]!.reason).toMatch(
      /missing columns/,
    );
  });

  it("parses doubled quotes and embedded newlines", () => {
    expect(parseCsv('a,"b ""q""\nc"\n')).toEqual([["a", 'b "q"\nc']]);
  });
});
