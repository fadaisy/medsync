/**
 * P1 gate: the NCDReg 0.1 standard as versioned data (§5). Every seeded item is draft, the catalogue
 * holds two full and eight core modules that follow the module contract, and the generated documents
 * on disk are exactly what the module renders (twice, identically).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CARE_BAND_RULE, FORMULAS, HTN_GRADE_TABLE } from "@/lib/ncdreg/standard/calculations";
import { CLASSIFICATIONS } from "@/lib/ncdreg/standard/classifications";
import { ALL_CODE_LISTS, MEDICINE_LIST, OBSERVATION_CODES } from "@/lib/ncdreg/standard/code-lists";
import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";
import { DICTIONARY } from "@/lib/ncdreg/standard/dictionary";
import { generatedDocs } from "@/lib/ncdreg/standard/generated-docs";
import { ALL_INDICATORS, WINDOWS } from "@/lib/ncdreg/standard/indicators";
import {
  CONFIRM_RANGES,
  CONSISTENCY_RULES,
  DUPLICATE_RULES,
  HARD_BLOCKS,
} from "@/lib/ncdreg/standard/validation";
import { EXPECTED } from "../ncdreg-db/golden/expected";

const code = z.object({ code: z.string().min(1), label: z.string().min(1) }).strict();
const versioned = {
  version: z.string().min(1),
  status: z.literal("draft"),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};
const component = z.enum(["hba1c", "kidney", "eyes", "feet", "lipids"]);
const moduleSchema = z
  .object({
    ...versioned,
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    level: z.enum(["full", "core"]),
    subtypes: z.array(code).min(1),
    basis_of_diagnosis: z.array(code).min(1),
    diagnosis_codes: z.array(
      z.object({
        icd11: z.string(),
        icd10: z.string(),
        label: z.string(),
        subtype: z.string().optional(),
      }),
    ),
    medicine_groups: z.array(z.string()),
    visit_fields: z.array(
      z.object({
        code: z.string(),
        label: z.string(),
        type: z.enum(["number", "integer", "enum", "boolean"]),
        unit: z.string().optional(),
        options: z.array(code).optional(),
        confirm_range: z.tuple([z.number(), z.number()]).optional(),
        requirement: z.enum(["expected", "offered"]),
        storage: z.enum(["visit_column", "observation"]),
      }),
    ),
    outcome_classification: z.union([
      z.object({
        kind: z.literal("rule"),
        classification: z.string(),
        classes: z.array(z.string()).min(2),
        in_range: z.string(),
      }),
      z.object({ kind: z.literal("clinician_recorded") }),
    ]),
    review_components: z.array(z.object({ component, interval_months: z.literal(12) })),
    outcome_label: z.string(),
    admission_reasons: z.array(code),
    event_types: z.array(code),
    sms_banned_terms: z.array(z.string().min(2)).min(1),
    enabled_by_default: z.boolean(),
  })
  .strict();

describe("condition catalogue (§5.6)", () => {
  it("every module follows the module contract", () => {
    for (const m of CONDITION_CATALOGUE) expect(() => moduleSchema.parse(m), m.code).not.toThrow();
  });

  it("has exactly the two full and eight core modules, with unique codes", () => {
    const codes = CONDITION_CATALOGUE.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(CONDITION_CATALOGUE.filter((m) => m.level === "full").map((m) => m.code)).toEqual([
      "diabetes",
      "hypertension",
    ]);
    expect(CONDITION_CATALOGUE.filter((m) => m.level === "core").map((m) => m.code)).toEqual([
      "chronic_kidney_disease",
      "heart_failure",
      "cardiovascular_disease",
      "asthma",
      "copd",
      "sickle_cell_disease",
      "epilepsy",
      "thyroid_disease",
    ]);
  });

  it("seeds no cancer and no mental health module", () => {
    const text = JSON.stringify(CONDITION_CATALOGUE).toLowerCase();
    for (const w of [
      "cancer",
      "tumour",
      "oncology",
      "depression",
      "schizophrenia",
      "bipolar",
      "psychosis",
      "mental",
    ])
      expect(text).not.toContain(w);
  });

  it("full modules: rule outcome, enabled by default, 'In range'", () => {
    for (const m of CONDITION_CATALOGUE.filter((x) => x.level === "full")) {
      expect(m.outcome_classification.kind).toBe("rule");
      expect(m.enabled_by_default).toBe(true);
      expect(m.outcome_label).toBe("In range");
      if (m.outcome_classification.kind === "rule") {
        expect(CLASSIFICATIONS[m.outcome_classification.classification]).toBeDefined();
        expect(m.outcome_classification.classes).toContain(m.outcome_classification.in_range);
      }
    }
  });

  it("core modules: clinician-recorded, disabled, 'Recorded as controlled', nothing seeded beyond the table", () => {
    for (const m of CONDITION_CATALOGUE.filter((x) => x.level === "core")) {
      expect(m.outcome_classification).toEqual({ kind: "clinician_recorded" });
      expect(m.enabled_by_default).toBe(false);
      expect(m.outcome_label).toBe("Recorded as controlled");
      expect(m.outcome_label.toLowerCase()).not.toContain("in range");
      expect(m.diagnosis_codes).toEqual([]);
      expect(m.medicine_groups).toEqual([]);
      expect(m.basis_of_diagnosis.map((b) => b.code)).toEqual([
        "clinician_diagnosis",
        "on_treatment_at_referral",
        "unknown",
      ]);
      for (const f of m.visit_fields) {
        expect(f.storage).toBe("observation");
        expect(f.confirm_range).toBeUndefined(); // no thresholds for core modules
      }
      if (m.code !== "cardiovascular_disease")
        expect(m.subtypes.map((s) => s.code)).toEqual(["unknown"]);
    }
  });
});

describe("everything is draft and versioned (§5)", () => {
  it("code lists, formulas, tables, classifications, validation, indicators, dictionary", () => {
    const items: { status: string; version: string; effective_from: string }[] = [
      ...ALL_CODE_LISTS,
      MEDICINE_LIST,
      ...Object.values(FORMULAS).map((x) => ({ ...x })),
      HTN_GRADE_TABLE,
      CARE_BAND_RULE as unknown as { status: string; version: string; effective_from: string },
      ...Object.values(CLASSIFICATIONS),
      HARD_BLOCKS,
      CONFIRM_RANGES,
      CONSISTENCY_RULES,
      DUPLICATE_RULES,
      ...ALL_INDICATORS,
      WINDOWS,
      DICTIONARY as unknown as { status: string; version: string; effective_from: string },
    ];
    for (const i of items) {
      expect(i.status).toBe("draft");
      expect(i.version).toBeTruthy();
      expect(i.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("external codes are unverified", () => {
    expect(OBSERVATION_CODES.verified).toBe(false);
    expect(MEDICINE_LIST.verified).toBe(false);
  });

  it("no HIV status field and no dose field (open decisions)", () => {
    const names = DICTIONARY.records.flatMap((r) => r.fields.map((f) => f.name.toLowerCase()));
    expect(names.some((n) => n.includes("hiv"))).toBe(false);
    expect(names.some((n) => n.includes("dose") && n !== "missed_doses")).toBe(false);
  });

  it("indicator codes are the 34 of §6, two-digit", () => {
    expect(ALL_INDICATORS.map((i) => i.code)).toEqual([
      ...Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 6 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, i) => `H${String(i + 1).padStart(2, "0")}`),
    ]);
  });
});

describe("generated documents never drift (§5)", () => {
  for (const [path, render] of Object.entries(generatedDocs(EXPECTED))) {
    it(`${path} regenerates identically twice and matches the file`, () => {
      const a = render();
      expect(render()).toBe(a);
      expect(readFileSync(resolve(__dirname, "../..", path), "utf8")).toBe(a);
    });
  }
});
