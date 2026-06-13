import type { InvestigationSet } from "@/lib/clerkship/suggestions/types";
import { describe, expect, it } from "vitest";

import { suggestInvestigations } from "@/lib/clerkship/suggestions/engine";

const src = (guideline: string) => ({
  guideline,
  version: "2025",
  recommendation: "test recommendation",
  url: "https://example.org",
  retrieved: "2026-06-12",
});

const CATALOG: InvestigationSet[] = [
  {
    pcCode: "chest_pain",
    presentation: "Chest pain / suspected ACS",
    tests: [
      {
        test: "12-lead ECG",
        rationale: "Identify STEMI / ischaemia",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: src("ESC ACS"),
      },
      {
        test: "Troponin",
        loinc: "6598-7",
        rationale: "Myocardial injury",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: src("ESC ACS"),
      },
      {
        test: "Chest X-ray",
        rationale: "Alternative causes",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "medium",
        source: src("ESC ACS"),
      },
    ],
  },
  {
    pcCode: "dyspnoea",
    presentation: "Acute breathlessness",
    tests: [
      {
        test: "12-lead ECG",
        rationale: "Cardiac cause of dyspnoea",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: src("GINA/GOLD"),
      },
      {
        test: "SpO2",
        rationale: "Hypoxaemia",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: src("GINA/GOLD"),
      },
    ],
  },
];

describe("suggestInvestigations", () => {
  it("returns nothing for an unknown presenting complaint", () => {
    expect(suggestInvestigations(["unknown_pc"], CATALOG)).toEqual([]);
    expect(suggestInvestigations([], CATALOG)).toEqual([]);
  });

  it("returns the cited tests for a matching presenting complaint", () => {
    const out = suggestInvestigations(["chest_pain"], CATALOG);
    expect(out.map((t) => t.test).sort()).toEqual(["12-lead ECG", "Chest X-ray", "Troponin"]);
    const ecg = out.find((t) => t.test === "12-lead ECG")!;
    expect(ecg.source.guideline).toBe("ESC ACS");
    expect(ecg.why).toEqual(["Chest pain / suspected ACS"]);
  });

  it("merges + de-duplicates a shared test across presentations, keeping both 'why's", () => {
    const out = suggestInvestigations(["chest_pain", "dyspnoea"], CATALOG);
    const ecg = out.filter((t) => t.test === "12-lead ECG");
    expect(ecg).toHaveLength(1);
    expect(ecg[0]!.why).toEqual(["Chest pain / suspected ACS", "Acute breathlessness"]);
  });

  it("escalates a de-duped test to must-not-miss / core if ANY source says so", () => {
    // ECG is must-not-miss+core via chest_pain, context+non-mnm via dyspnoea → keep the safer.
    const out = suggestInvestigations(["dyspnoea", "chest_pain"], CATALOG);
    const ecg = out.find((t) => t.test === "12-lead ECG")!;
    expect(ecg.mustNotMiss).toBe(true);
    expect(ecg.ugandaTier).toBe("core");
  });

  it("ranks must-not-miss first, then core before context", () => {
    const out = suggestInvestigations(["chest_pain", "dyspnoea"], CATALOG);
    // must-not-miss (ECG, Troponin) must precede non-mnm (SpO2 core, CXR context)
    const firstNonMnm = out.findIndex((t) => !t.mustNotMiss);
    expect(out.slice(0, firstNonMnm).every((t) => t.mustNotMiss)).toBe(true);
    // within non-mnm, core (SpO2) precedes context (Chest X-ray)
    const nonMnm = out.filter((t) => !t.mustNotMiss);
    expect(nonMnm[0]!.ugandaTier).toBe("core");
    expect(nonMnm[nonMnm.length - 1]!.ugandaTier).toBe("context");
  });
});
