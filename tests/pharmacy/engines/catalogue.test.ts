import { describe, expect, it } from "vitest";

import {
  isMedicine,
  issueUnitLocked,
  nationalListMatch,
  noProductText,
  priceSnapshot,
  productsAtPoint,
  sameStrength,
  signedEntry,
} from "@/lib/pharmacy/catalogue";
import { DRUGS } from "@/lib/prescribing/formulary";

/** Pharmacy Phase 1 — the catalogue (CT-1..CT-7, H2, W4). Fixture products and points are invented. */
const P = "fixture-point-a";

describe("CT-1 one medicine list", () => {
  it("CT-1 a medicine is a row of the prescribing catalogue; nothing else is", () => {
    expect(isMedicine(DRUGS[0]?.id ?? "")).toBe(true);
    expect(isMedicine("fixture-not-on-the-list")).toBe(false);
  });
});

describe("CT-2 products at a point", () => {
  const products = [
    { id: "fx-p1", medicineId: "fx-med-a", active: true, name: "Fixture tablet A, pack 100" },
    { id: "fx-p2", medicineId: "fx-med-a", active: true, name: "Fixture tablet A, pack 28" },
    { id: "fx-p3", medicineId: "fx-med-a", active: false, name: "Fixture tablet A, retired" },
    { id: "fx-p4", medicineId: "fx-med-b", active: true, name: "Fixture capsule B" },
  ];
  const row = (
    productId: string,
    pointId = P,
    o: { active?: boolean; endedAt?: Date | null } = {},
  ) => ({
    productId,
    dispensingPointId: pointId,
    active: o.active ?? true,
    endedAt: o.endedAt ?? null,
  });
  it("CT-2 only active products of the medicine with an active row at this point", () => {
    const points = [
      row("fx-p1"),
      row("fx-p2", P, { active: false, endedAt: new Date("2026-10-01T00:00:00Z") }),
      row("fx-p3"),
      row("fx-p4"),
      row("fx-p2", "fixture-point-b"),
    ];
    expect(productsAtPoint(products, points, "fx-med-a", P).map((p) => p.id)).toEqual(["fx-p1"]);
    expect(
      productsAtPoint(products, points, "fx-med-a", "fixture-point-b").map((p) => p.id),
    ).toEqual(["fx-p2"]);
    expect(productsAtPoint(products, points, "fx-med-c", P)).toEqual([]);
  });
});

describe("CT-3 national list matching", () => {
  const meds = [
    { id: "fx-1", generic: "Fixturol", form: "Tablet", strength: "10 mg" },
    { id: "fx-2", generic: "Fixturol", form: "Tablet", strength: "20 mg" },
    { id: "fx-3", generic: "Fixtamide", form: null, strength: null },
  ];
  it("CT-3 matches exactly on generic, form and strength as text", () => {
    expect(nationalListMatch({ generic: "fixturol", form: "tablet", strength: "10mg" }, meds)).toBe(
      "fx-1",
    );
  });
  it("CT-3 nothing by guess: a missing field, another strength or two candidates stay unmatched", () => {
    expect(
      nationalListMatch({ generic: "Fixturol", form: "Tablet", strength: "0.01 g" }, meds),
    ).toBeNull();
    expect(
      nationalListMatch({ generic: "Fixturol", form: "Tablet", strength: null }, meds),
    ).toBeNull();
    expect(
      nationalListMatch({ generic: "Fixtamide", form: "Tablet", strength: "5 mg" }, meds),
    ).toBeNull();
    const twice = [...meds, { id: "fx-4", generic: "Fixturol", form: "Tablet", strength: "10 mg" }];
    expect(
      nationalListMatch({ generic: "Fixturol", form: "Tablet", strength: "10 mg" }, twice),
    ).toBeNull();
  });
});

describe("CT-4 units and strengths are never converted", () => {
  it("CT-4 the issue unit locks once the product has a movement", () => {
    expect(issueUnitLocked(true)).toBe(true);
    expect(issueUnitLocked(false)).toBe(false);
  });
  it("CT-4 H2 strength compares as text, ignoring case and spacing only", () => {
    expect(sameStrength("500 mg", "500mg")).toBe("same");
    expect(sameStrength("500 MG", " 500 mg ")).toBe("same");
    expect(sameStrength("500 mg", "0.5 g")).toBe("different");
    expect(sameStrength("2.5 mg", "2,5 mg")).toBe("different");
    expect(sameStrength("250 mg/5 mL", "250 mg/5 mL")).toBe("same");
  });
  it("CT-4 H2 an unknown strength is never the same", () => {
    expect(sameStrength(null, "500 mg")).toBe("unknown");
    expect(sameStrength("500 mg", null)).toBe("unknown");
    expect(sameStrength(null, null)).toBe("unknown");
    expect(sameStrength("  ", "500 mg")).toBe("unknown");
  });
});

describe("CT-5 price", () => {
  it("CT-5 the price in force is snapshotted as stored, never added up or rounded", () => {
    expect(priceSnapshot({ priceUgx: "1500.50" })).toBe("1500.50");
    expect(priceSnapshot({ priceUgx: null })).toBeNull();
  });
});

describe("CT-6 no product at the point", () => {
  it("CT-6 Appendix B's words with the point's name", () => {
    expect(noProductText("Fixture point A")).toBe(
      "No product is set up for this medicine at Fixture point A.",
    );
  });
});

describe("CT-7 signed per-medicine data", () => {
  const set = {
    hospitalId: "fx-h1",
    status: "signed" as const,
    version: 2,
    content: { "fx-med-a": "fixture class" },
  };
  it("CT-7 only a signed set of this hospital answers", () => {
    expect(signedEntry(set, "fx-h1", "fx-med-a")).toBe("fixture class");
    expect(signedEntry(set, "fx-h1", "fx-med-b")).toBeNull();
    expect(signedEntry(set, "fx-h2", "fx-med-a")).toBeNull();
    expect(signedEntry({ ...set, status: "draft" }, "fx-h1", "fx-med-a")).toBeNull();
    expect(signedEntry(null, "fx-h1", "fx-med-a")).toBeNull();
  });
});
