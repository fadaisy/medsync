import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DISPENSING_SERVES } from "@/db/schema/pharmacy";
import { defaultLane } from "@/lib/pharmacy/queue";
import { derivedPharmacy, PHARMACY_DERIVED_KEYS } from "@/supabase/functions/_shared/services-hub";

/** Pharmacy Phase 0 — dispensing points (DP-1..DP-4, ADR 0236; §5.8). */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("DP-2: the hub's pharmacy values from the points", () => {
  it("no point: the typed values stand", () => {
    expect(derivedPharmacy([])).toBeNull();
    expect(derivedPharmacy([{ serviceHours: "24 hours", archived: true }])).toBeNull();
  });

  it("counts live points; 24 hours only when a point's hours say exactly that", () => {
    expect(
      derivedPharmacy([
        { serviceHours: "Mon to Fri, 08:00–17:00", archived: false },
        { serviceHours: " 24 Hours ", archived: false },
        { serviceHours: "24 hours", archived: true },
      ]),
    ).toEqual({ pharmacy_dispensing_points: 2, pharmacy_24h: true });
    expect(derivedPharmacy([{ serviceHours: "24 hours except Sundays", archived: false }])).toEqual(
      { pharmacy_dispensing_points: 1, pharmacy_24h: false },
    );
  });

  it("the two keys are the hub's typed pharmacy keys, and typing them is refused once points exist", () => {
    const hub = read("supabase/functions/_shared/services-hub.ts");
    for (const k of PHARMACY_DERIVED_KEYS) expect(hub).toMatch(new RegExp(`key: "${k}"`));
    const ops = read("supabase/functions/ha-services-hub/ops-services.ts");
    expect(ops).toMatch(
      /PHARMACY_DERIVED_KEYS\.includes\(key\.key\)[\s\S]*worked out from the dispensing points/,
    );
  });
});

describe("DP-1: a point is a unit of the Pharmacy department; DP-4: serves picks the lane", () => {
  it("the hub op accepts only a live unit of PHARMACY, audited before it writes", () => {
    const op = read("supabase/functions/ha-services-hub/ops-structure.ts");
    const body = op.slice(op.indexOf("const setDispensingPoint"), op.indexOf("const addUnit"));
    expect(body).toMatch(/if \(!unit\.parent_id\)/);
    expect(body).toMatch(/parent\.catalogue_code !== "PHARMACY"/);
    expect(body).toMatch(/unit\.archived_at/);
    expect(body.indexOf("audit:")).toBeLessThan(body.indexOf("apply:"));
    expect(op).toMatch(/set_dispensing_point: setDispensingPoint/);
  });

  it("serves has four values and each opens a lane", () => {
    expect([...DISPENSING_SERVES]).toEqual(["window", "wards", "emergency", "all"]);
    expect(DISPENSING_SERVES.map(defaultLane)).toEqual(["window", "ward", "ward", "all"]);
  });
});
