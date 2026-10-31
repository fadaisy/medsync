import { describe, expect, it } from "vitest";

import {
  batchRows,
  deliveryRows,
  prescriptionKey,
  SUPPLIED_MAX,
  suppliedPatientIds,
  suppliedRows,
} from "@/lib/pharmacy/workspace-v2/find";

const sup = (p: string, at: string, reversed = false, key: string | null = "k") => ({
  patientUserId: p,
  suppliedAt: new Date(at),
  reversed,
  medicine: "Morphine oral solution",
  medicineId: "morphine_oral",
  key,
});

describe("Find rows", () => {
  it("prescription key: the placement, else the time key", () => {
    const createdAt = new Date("2026-10-27T10:00:00.000Z");
    expect(
      prescriptionKey({ placementId: "p1", encounterId: null, prescriberUserId: "u", createdAt }),
    ).toBe("p1");
    expect(
      prescriptionKey({ placementId: null, encounterId: null, prescriberUserId: "u", createdAt }),
    ).toBe("t:none:u:2026-10-27T10:00:00.000Z");
  });

  it("batch rows link to the stock medicine page and name an earlier number", () => {
    const [r] = batchRows([
      {
        batchNumber: "M-0112",
        firstBatchNumber: "M-112",
        expiry: "2027-03-31",
        productName: "Morphine",
        medicineId: "morphine_oral",
        placeName: "Main store",
      },
    ]);
    expect(r).toMatchObject({ group: "batch", href: "/pharmacy/stock/morphine_oral", mono: true });
    expect(r!.label).toContain("M-0112");
    expect(r!.sub).toContain("M-112");
  });

  it("supplied: net of reversals, newest per patient, two identifiers, at most 10", () => {
    const supplies = [
      sup("a", "2026-10-26T08:00:00Z"),
      sup("a", "2026-10-27T08:00:00Z"),
      sup("b", "2026-10-27T09:00:00Z", true),
      sup("c", "2026-10-25T09:00:00Z", false, null),
    ];
    const ids = new Map([
      ["a", { name: "Demo A", mrn: "MS-1" }],
      ["b", { name: "Demo B", mrn: "MS-2" }],
      ["c", { name: "Demo C", mrn: "MS-3" }],
    ]);
    expect(suppliedPatientIds(supplies)).toEqual(["a", "c"]);
    const rows = suppliedRows(supplies, ids);
    expect(rows.map((r) => r.label)).toEqual(["Demo A", "Demo C"]);
    expect(rows[0]!.sub).toContain("MS-1");
    expect(rows[0]!.href).toBe("/pharmacy/prescriptions/k");
    expect(rows[1]!.href).toBe("/pharmacy/stock/morphine_oral");
    const many = Array.from({ length: 15 }, (_, i) => sup(`p${i}`, `2026-10-27T0${i % 10}:00:00Z`));
    const manyIds = new Map(
      many.map((s) => [s.patientUserId, { name: s.patientUserId, mrn: "M" }]),
    );
    expect(suppliedPatientIds(many)).toHaveLength(SUPPLIED_MAX);
    expect(suppliedRows(many, manyIds)).toHaveLength(SUPPLIED_MAX);
  });

  it("delivery rows link to the delivery", () => {
    const [r] = deliveryRows([
      {
        id: "d1",
        noteNumber: "INV-1",
        supplier: "A",
        placeName: "Main store",
        arrivedAt: new Date(),
      },
    ]);
    expect(r).toMatchObject({
      group: "delivery",
      label: "INV-1",
      href: "/pharmacy/store/deliveries/d1",
    });
  });
});
