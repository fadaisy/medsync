import { describe, expect, it } from "vitest";

import { suggestManagement } from "@/lib/clerkship/suggestions/engine";
import {
  MANAGEMENT_PATHWAYS,
  MANAGEMENT_PATHWAYS_CSO_SIGNED,
  suggestedManagementFor,
} from "@/lib/clerkship/suggestions/management";

describe("suggestManagement (pure engine)", () => {
  it("returns pathways whose PC codes intersect the active complaints, preserving step order", () => {
    const out = suggestManagement(["dyspnoea"], MANAGEMENT_PATHWAYS);
    expect(out.map((p) => p.condition)).toContain("Acute asthma exacerbation");
    const asthma = out.find((p) => p.condition === "Acute asthma exacerbation")!;
    // first authored step is the severity assessment — order is preserved, not sorted
    expect(asthma.steps[0]!.step).toMatch(/severity assessment/i);
    expect(asthma.why).toContain("dyspnoea");
  });

  it("matches a pathway via any of its PC codes and records every matching code in why", () => {
    const out = suggestManagement(["fever", "confusion"], MANAGEMENT_PATHWAYS);
    const sepsis = out.find((p) => p.condition.startsWith("Sepsis"))!;
    expect(sepsis).toBeDefined();
    expect(sepsis.why.sort()).toEqual(["confusion", "fever"]);
  });

  it("returns each matching pathway exactly once", () => {
    const out = suggestManagement(["fever", "confusion"], MANAGEMENT_PATHWAYS);
    const conditions = out.map((p) => p.condition);
    expect(new Set(conditions).size).toBe(conditions.length);
  });

  it("returns nothing for an unrelated complaint", () => {
    expect(suggestManagement(["palpitations"], MANAGEMENT_PATHWAYS)).toEqual([]);
  });
});

describe("suggestedManagementFor (gated)", () => {
  it("returns nothing until the CSO signs the tranche", () => {
    // The catalog is dark until sign-off — the public accessor must respect the gate.
    if (!MANAGEMENT_PATHWAYS_CSO_SIGNED) {
      expect(suggestedManagementFor(["fever"])).toEqual([]);
    } else {
      expect(suggestedManagementFor(["fever"]).length).toBeGreaterThan(0);
    }
  });
});

describe("DRUG-DOSE FIREWALL — the catalog names agents/classes, never doses", () => {
  // A drug DOSE = a number followed by a dose/volume unit (mg/mL/mcg/mmol/IU/units),
  // or a per-kg dose. Named agents/classes ("norepinephrine", "IV magnesium
  // sulfate") and physiological targets ("65 mmHg", "94–98%") are allowed.
  const DOSE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|mmol|iu|units?)\b|\b(mg|mcg|µg|ml|mmol)\s?\/\s?kg\b/i;

  const allText: { where: string; text: string }[] = [];
  for (const p of MANAGEMENT_PATHWAYS) {
    if (p.feastGuardrail) allText.push({ where: `${p.condition} · FEAST`, text: p.feastGuardrail });
    for (const s of p.safetyNetting)
      allText.push({ where: `${p.condition} · safety-net`, text: s });
    for (const step of p.steps) {
      allText.push({ where: `${p.condition} · "${step.step}"`, text: step.step });
      allText.push({ where: `${p.condition} · detail`, text: step.detail });
      if (step.agentClass)
        allText.push({ where: `${p.condition} · agentClass`, text: step.agentClass });
      allText.push({ where: `${p.condition} · source`, text: step.source.recommendation });
    }
  }

  it("contains no drug dose anywhere in the catalog", () => {
    for (const { where, text } of allText) {
      expect(DOSE.test(text), `${where}: "${text}"`).toBe(false);
    }
  });

  it("every drug step names an agent/class and every non-drug step has none", () => {
    for (const p of MANAGEMENT_PATHWAYS) {
      for (const s of p.steps) {
        if (s.isDrug) {
          expect(s.agentClass?.trim(), `${p.condition} · "${s.step}"`).toBeTruthy();
        } else {
          expect(s.agentClass ?? "", `${p.condition} · "${s.step}"`).toBe("");
        }
      }
    }
  });

  it("every step carries a cited, version-stamped source with a URL", () => {
    for (const p of MANAGEMENT_PATHWAYS) {
      for (const s of p.steps) {
        expect(s.source.guideline.length, p.condition).toBeGreaterThan(0);
        expect(s.source.version.length, p.condition).toBeGreaterThan(0);
        expect(s.source.url.startsWith("http"), `${p.condition} · "${s.step}"`).toBe(true);
        expect(s.source.recommendation.length, p.condition).toBeGreaterThan(0);
      }
    }
  });
});
