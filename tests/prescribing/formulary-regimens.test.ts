/**
 * The signed emergency regimens laid over MS-RX-CAT-001 (ADR 0187 §5): carried without changing
 * a value. Every number a regimen sets appears in its verbatim quote, and every quote is the signed
 * entry's own text.
 */
import { describe, expect, it } from "vitest";

import { drugById } from "@/lib/prescribing/formulary";
import { getEmergencyDrug } from "@/lib/prescribing/reference/emergency-drug-catalog";
import { SIGNED_DOSE_ORIGIN, SIGNED_DOSES } from "@/lib/prescribing/reference/formulary-regimens";

const signedTexts = (id: string) => {
  const e = getEmergencyDrug(id)!;
  return [e.adult?.dose, e.adult?.interval, e.paediatric.note].filter(Boolean) as string[];
};

describe("signed regimens", () => {
  for (const [drugId, dose] of Object.entries(SIGNED_DOSES)) {
    const origin = SIGNED_DOSE_ORIGIN[drugId]!;
    const entry = getEmergencyDrug(origin)!;

    it(`${drugId}: verified, CSO-signed, from ${origin}, on a catalogue drug`, () => {
      expect(drugById(drugId)?.dose.status).toBe("verified");
      expect(dose).toMatchObject({
        status: "verified",
        csoSigned: true,
        origin: "emergency-formulary",
      });
      expect(entry.confidence).toBe("verified-web");
    });

    for (const r of dose.regimens) {
      it(`${r.id}: every number is in its quote, and the quote is the signed text`, () => {
        expect(r.sources.length).toBeGreaterThan(0);
        for (const s of r.sources) {
          expect(signedTexts(origin)).toContain(s.quote);
          expect(s.citation).toBe(entry.source);
          expect(s.checkedAt).toBe("2026-06-03");
          expect(s.url).toBeUndefined();
        }
        const quote = r.sources.map((s) => s.quote).join(" ");
        const nums = [
          r.doseNum,
          r.doseRange?.low,
          r.doseRange?.high,
          r.perKg?.amount,
          r.perKg?.amountHigh,
          r.perKg?.max,
          r.appliesWhen?.ageYearsBelow,
          r.appliesWhen?.ageYearsAtLeast,
          r.appliesWhen?.weightKgBelow,
          r.appliesWhen?.weightKgAtLeast,
        ].filter((n): n is number => n != null);
        for (const n of nums)
          expect(quote, `${r.id} ${n}`).toMatch(new RegExp(`(^|[^\\d])${n}([^\\d]|$)`));
        expect(quote).toContain(r.unit === "µg" ? "µg" : r.unit);
        if (r.strength) expect(quote).toContain(r.strength);
        if (r.admin) expect(signedTexts(origin).join(" ")).toContain(r.admin);
        if (r.then) expect(signedTexts(origin)).toContain(r.then);
        expect(drugById(drugId)!.routes).toContain(r.route);
      });
    }

    it(`${drugId}: no older-adult regimen is invented`, () => {
      expect(dose.regimens.some((r) => r.band === "olderAdult")).toBe(false);
      expect(dose.bands.olderAdult).toBeNull();
    });
  }

  it("the glucose 20% option stays a quote: no regimen for it", () => {
    const g = SIGNED_DOSES.glucose_10!;
    expect(g.bands.adult).toContain("75 mL of 20%");
    expect(g.regimens.some((r) => r.strength === "20%" || r.doseNum === 75)).toBe(false);
  });
});
