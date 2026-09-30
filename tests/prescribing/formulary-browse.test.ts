/**
 * "Show all" medicines in the prescribing dialog: every drug of MS-RX-CAT-001 under its body system
 * and class, against the real catalogue. Nothing lost, nothing twice, nothing ranked; the filter is
 * the search's.
 */
import { describe, expect, it } from "vitest";

import { DRUGS, formularyBrowse, offersRegimens, searchDrugs } from "@/lib/prescribing/formulary";
import { DRUG_CLASSES, DRUG_SYSTEMS } from "@/lib/prescribing/reference/general-formulary";

const ids = (q = "") =>
  formularyBrowse(q).flatMap((s) => s.classes.flatMap((c) => c.drugs.map((d) => d.id)));

describe("every medicine by body system and class", () => {
  const all = formularyBrowse();

  it("lists all 182 medicines exactly once, each under its own class and that class's system", () => {
    const listed = ids();
    expect(listed).toHaveLength(DRUGS.length);
    expect(new Set(listed).size).toBe(DRUGS.length);
    for (const s of all)
      for (const c of s.classes) {
        const cls = DRUG_CLASSES.find((x) => x.id === c.id)!;
        expect(cls.system, c.id).toBe(s.id);
        expect(c.name).toBe(cls.name);
        for (const d of c.drugs) expect(d.class, d.id).toBe(c.id);
      }
  });

  it("keeps the catalogue's order of systems and classes; a system's count is its medicines", () => {
    const order = DRUG_SYSTEMS.map((s) => s.id);
    expect(all.map((s) => order.indexOf(s.id))).toEqual(
      all.map((s) => order.indexOf(s.id)).sort((a, b) => a - b),
    );
    for (const s of all) {
      const catalogue = DRUG_CLASSES.filter((c) => c.system === s.id).map((c) => c.id);
      const shown = s.classes.map((c) => c.id);
      expect(shown).toEqual(catalogue.filter((id) => shown.includes(id)));
      expect(s.count).toBe(s.classes.reduce((n, c) => n + c.drugs.length, 0));
    }
  });

  it("every class with a medicine of its own is a heading; a parent with none (Cephalosporins) is not", () => {
    const headed = all.flatMap((s) => s.classes.map((c) => c.id));
    const withDrugs = DRUG_CLASSES.filter((c) => DRUGS.some((d) => d.class === c.id)).map(
      (c) => c.id,
    );
    expect(headed.sort()).toEqual(withDrugs.sort());
    expect(headed).not.toContain("abx.cephalosporin");
    expect(headed).toContain("abx.cephalosporin.3");
  });

  it("medicines are A to Z within a class: an order, never a ranking", () => {
    for (const s of all)
      for (const c of s.classes) {
        const names = c.drugs.map((d) => d.generic);
        expect(names, c.id).toEqual(
          [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
        );
      }
  });

  it("a regimen is shown as signed only where one is verified and CSO-signed", () => {
    const signed = DRUGS.filter((d) => offersRegimens(d.dose));
    for (const d of signed) {
      expect(d.dose.status).toBe("verified");
      expect(d.dose.csoSigned).toBe(true);
    }
    // Every other medicine is typed: the catalogue carries no unverified dose (ADR 0186).
    expect(signed.length).toBeLessThan(DRUGS.length);
  });
});

describe("the filter", () => {
  it("matches the generic name, the class or the body system, every word, any case", () => {
    expect(ids("ceftriaxone")).toEqual(["ceftriaxone"]);
    const cephs = ids("cephalosporins");
    expect(cephs.length).toBeGreaterThan(1);
    expect(cephs).toContain("ceftriaxone");
    const cardio = formularyBrowse("CARDIOVASCULAR");
    expect(cardio.map((s) => s.id)).toEqual(["cardiovascular"]);
    expect(ids("third generation cephalosporins")).toContain("ceftriaxone");
  });

  it("finds what the search finds, with nothing dropped by a limit", () => {
    for (const q of ["penicillin", "insulin", "oral", "respiratory"])
      expect(new Set(ids(q))).toEqual(new Set(searchDrugs(q, 1000).map((d) => d.id)));
  });

  it("drops empty classes and systems; nothing matching leaves nothing", () => {
    for (const s of formularyBrowse("ceftriaxone")) {
      expect(s.classes.every((c) => c.drugs.length > 0)).toBe(true);
      expect(s.count).toBeGreaterThan(0);
    }
    expect(formularyBrowse("zzzz-no-such-medicine")).toEqual([]);
    expect(ids("   ")).toHaveLength(DRUGS.length);
  });
});
