/**
 * Recall requirement evidence that needs no database: E4 (banned terms in every template) and E3
 * (the send window, in facility time). The DB lane covers the dispatcher end to end
 * (tests/ncdreg-db/recall.test.ts).
 */
import { describe, expect, it } from "vitest";

import { DEMO_CATALOGUE } from "@/lib/ncdreg/demo/source";
import { bannedTerms, bannedTermsIn } from "@/lib/ncdreg/recall/banned";
import { insideWindow, localClock } from "@/lib/ncdreg/recall/dispatcher";
import { MEDICINE_LIST } from "@/lib/ncdreg/standard/code-lists";
import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";
import { seedRows } from "@/lib/ncdreg/recall/templates";

describe("E4: SMS text never names a disease, a measurement, a medicine or the department", () => {
  const terms = bannedTerms();

  it("the banned list holds E4's words, every seeded medicine and every catalogue label and sms_banned_terms entry", () => {
    for (const w of ["diabetes", "sugar", "glucose", "pressure", "hypertension", "insulin", "kidney", "ncd"]) expect(terms).toContain(w);
    for (const m of MEDICINE_LIST.medicines.filter((x) => x.group !== "other")) expect(terms).toContain(m.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    for (const m of CONDITION_CATALOGUE) {
      expect(terms).toContain(m.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
      for (const t of m.sms_banned_terms) expect(terms).toContain(t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    }
  });

  it("every template (seeded and demo catalogue) has no banned term", () => {
    const bodies = [...seedRows("f", null).map((r) => r.body), ...DEMO_CATALOGUE.sms_templates_demo.map((t) => t.text)];
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const b of bodies) expect(bannedTermsIn(b, terms), b).toEqual([]);
  });

  it("the scan catches a disease, a measurement, a medicine and a module label, in any case and as a word prefix", () => {
    expect(bannedTermsIn("Bring your INSULINS")).toContain("insulin");
    expect(bannedTermsIn("Check your blood pressure")).toEqual(expect.arrayContaining(["blood", "pressure"]));
    expect(bannedTermsIn(`Collect ${MEDICINE_LIST.medicines[0]!.label} today`)).not.toEqual([]);
    expect(bannedTermsIn(`Your ${CONDITION_CATALOGUE[0]!.label} review`)).not.toEqual([]);
    expect(bannedTermsIn("Come to the NCD clinic")).toContain("ncd");
  });

  it("placeholders are not scanned as words, and plain wording passes", () => {
    expect(bannedTermsIn("You have an appointment at [HOSPITAL NAME] on [DATE]. Call [CLINIC PHONE].")).toEqual([]);
  });

  it("seeded templates: English as draft from the catalogue wording, Luganda slots empty awaiting approval, no translation written", () => {
    const rows = seedRows("f", null);
    for (const r of rows.filter((x) => x.language === "en")) {
      expect(r.status).toBe("draft");
      expect(r.body.length).toBeGreaterThan(0);
    }
    const lg = rows.filter((x) => x.language === "lg");
    expect(lg.length).toBe(2);
    for (const r of lg) expect(r).toMatchObject({ status: "pending_review", body: "" });
    expect(rows.some((r) => r.status === "approved")).toBe(false);
  });
});

describe("E3: quiet hours, in facility time", () => {
  it("the window is 08:00 inclusive to 18:00 exclusive", () => {
    expect(insideWindow("07:59", "08:00:00", "18:00:00")).toBe(false);
    expect(insideWindow("08:00", "08:00:00", "18:00:00")).toBe(true);
    expect(insideWindow("17:59", "08:00:00", "18:00:00")).toBe(true);
    expect(insideWindow("18:00", "08:00:00", "18:00:00")).toBe(false);
    expect(insideWindow("23:30", "08:00", "18:00")).toBe(false);
  });

  it("the clock is the facility's, not the server's: 06:30 UTC is 09:30 in Kampala", () => {
    expect(localClock(new Date("2026-10-05T06:30:00Z"), "Africa/Kampala")).toBe("09:30");
    expect(localClock(new Date("2026-10-05T15:30:00Z"), "Africa/Kampala")).toBe("18:30");
    expect(localClock(new Date("2026-10-05T21:05:00Z"), "Africa/Kampala")).toBe("00:05");
  });
});
