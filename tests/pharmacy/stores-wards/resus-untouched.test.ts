import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pharmacy Phase 2, S27 and Section 8: the resus desk's actions are untouched by ward stock and carts, and
 * no ward or cart action writes a prescription, the administration record, the resus timeline or
 * emergency_administrations. Cart uses are read from the resus timeline, never written (D-PH2-21).
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const RESUS_ACTIONS = [
  "openResusFromTriage",
  "openResusFromIntake",
  "openBlankResus",
  "logResusEvent",
  "correctResusEvent",
  "logResusVitals",
  "recordAirwayFindings",
  "setAirwayActionState",
  "recordBreathingFindings",
  "setBreathingActionState",
  "recordCirculationFindings",
  "setCirculationActionState",
  "recordDisabilityFindings",
  "setDisabilityActionState",
  "recordExposureFindings",
  "setExposureActionState",
  "recordResusReturnToA",
  "recordResusAllergies",
  "recordEmergencyAdministration",
  "assignResusRoleAction",
  "claimResusRoleAction",
  "acknowledgeResusAlertAction",
  "detectResusArrestAction",
  "concludeResus",
  "loadPersistentAllergiesForEpisode",
];

const OURS = [
  "lib/pharmacy/stores/ward-store.ts",
  "lib/pharmacy/stores/cart-store.ts",
  "lib/pharmacy/stores/ward-read.ts",
  "app/pharmacy/store/wards/actions.ts",
  "app/pharmacy/store/carts/actions.ts",
  "app/pharmacy/store/wards/_lib/act.ts",
  "app/nurse/ward-stock/actions.ts",
  "lib/nurse/ward-stock.ts",
];

describe("S27: the resus desk is untouched", () => {
  it("enumerates the resus desk's exported actions, unchanged", () => {
    const src = read("app/nurse/resus/actions.ts");
    const exported = [...src.matchAll(/^export (?:async function|function|const) (\w+)/gm)].map(
      (m) => m[1],
    );
    expect(exported).toEqual(RESUS_ACTIONS);
    // The free-text cart the cart check matches on (D-PH2-21) is still written as it was.
    expect(src).toContain("cart: parsed.data.cart ?? null,");
    expect(src).toContain("cart: z.string().max(48).optional(),");
  });

  it("no ward or cart file imports the resus desk or writes a clinical record", () => {
    for (const p of OURS) {
      const src = read(p);
      expect(src, p).not.toMatch(/nurse\/resus/);
      expect(src, p).not.toMatch(
        /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?(resus_\w+|medication_administration_records|prescriptions|emergency_administrations)\b/i,
      );
      expect(src, p).not.toMatch(
        /\.(insert|update|delete)\(\s*(resus\w*|medicationAdministrationRecords|prescriptions|emergencyAdministrations)\b/,
      );
    }
  });
});

describe("Law 4, WS-2, EC-2: doses and recorded uses never enter a stock figure", () => {
  it("the ward writes never read the administration record", () => {
    const src = read("lib/pharmacy/stores/ward-store.ts");
    expect(src).not.toMatch(/dosesCharted|medication_administration_records|cartUsesSince/);
  });
  it("the cart check's write step never reads the recorded uses", () => {
    const src = read("lib/pharmacy/stores/cart-store.ts");
    const complete = src.slice(
      src.indexOf("async function completeCheck"),
      src.indexOf("export async function recordCartCheck"),
    );
    expect(complete.length).toBeGreaterThan(100);
    expect(complete).not.toMatch(/cartUsesSince|\buses\b|resus/);
  });
  it("the reads of the clinical records return counts and times only: no dose, no patient", () => {
    const src = read("lib/pharmacy/stores/ward-read.ts");
    const mar = src.slice(
      src.indexOf("export async function dosesChartedSince"),
      src.indexOf("export interface CartUse"),
    );
    expect(mar).toMatch(/SELECT p\.drug_id AS medicine, m\.administered_at AS at/);
    expect(mar).not.toMatch(/m\.dose|patient_user_id|full_name/);
    const uses = src.slice(
      src.indexOf("export async function cartUsesSince"),
      src.indexOf("/** H2-16"),
    );
    expect(uses).not.toMatch(/->>'dose'|patient_user_id|full_name/);
  });
});
