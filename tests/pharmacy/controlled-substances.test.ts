/**
 * ADR 0470 (owner item 13): the signed list of controlled substances. The file parses; every entry names its source;
 * a medicine is controlled by any listed ingredient (salts included), with the strictest class; and, over the
 * catalogue seed from EMHSLU 2023, exactly these medicines become controlled.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CONTROLLED_SUBSTANCES,
  CONTROLLED_SUBSTANCES_COPY,
  controlledIngredient,
  controlledListLive,
  normaliseSubstance,
} from "@/lib/pharmacy/controlled-substances";
import { readNationalList } from "@/lib/pharmacy/national-list";
import { seedFromEmhslu } from "@/lib/pharmacy/shared-catalogue/seed";

const Entry = z.strictObject({
  substance: z.string().regex(/^[a-z]+$/),
  class: z.enum(["narcotic", "psychotropic", "policy"]),
  basis: z.enum(["law", "policy"]),
  source: z.string().min(20),
  matches: z.array(z.string().regex(/^[a-z0-9 ]+$/)).min(1),
});

const ing = (...keys: string[]) => keys.map((key) => ({ key, names: [] }));

describe("controlled substances (ADR 0470)", () => {
  it("parses, stays draft until the CSO signs it, and every entry names its source", () => {
    const list = z.array(Entry).parse(CONTROLLED_SUBSTANCES);
    expect(CONTROLLED_SUBSTANCES_COPY).toEqual({ status: "draft", signedBy: null, signedOn: null });
    expect(list.map((s) => `${s.substance}:${s.class}`)).toEqual([
      "morphine:narcotic",
      "pethidine:narcotic",
      "fentanyl:narcotic",
      "methadone:narcotic",
      "codeine:narcotic",
      "diazepam:psychotropic",
      "midazolam:psychotropic",
      "clonazepam:psychotropic",
      "alprazolam:psychotropic",
      "phenobarbital:psychotropic",
      "methylphenidate:psychotropic",
      "lorazepam:policy",
      "buprenorphine:policy",
      "ketamine:policy",
      "tramadol:policy",
      "thiopental:policy",
    ]);
    for (const s of list) {
      expect(s.matches[0]).toBe(s.substance);
      if (s.basis === "law") {
        expect(s.source).toMatch(/Cap\. 37\), Schedule [23], p\. \d+/);
        expect(s.class).toBe(s.source.includes("Schedule 2") ? "narcotic" : "psychotropic");
      } else {
        expect(s.class).toBe("policy");
        expect(s.source).toMatch(/owner decision 29 Oct 2026/);
      }
    }
  });

  it("matches substances and their salts, never a part of a name; the strictest class wins", () => {
    expect(controlledIngredient(ing("thiopental sodium"))?.substance).toBe("thiopental");
    expect(controlledIngredient(ing("amoxicillin"))).toBeNull();
    expect(controlledIngredient(ing("remifentanil"))).toBeNull();
    expect(controlledIngredient(ing("diazepamx"))).toBeNull();
    expect(controlledIngredient([{ key: "x", names: ["Phenobarbitone"] }])?.class).toBe(
      "psychotropic",
    );
    expect(controlledIngredient(ing("paracetamol", "codeine phosphate"))?.class).toBe("narcotic");
    expect(controlledIngredient(ing("ketamine", "diazepam"))?.class).toBe("psychotropic");
    expect(normaliseSubstance("Morphine (sulfate)")).toBe("morphine sulfate");
  });

  it("decides in production only once signed (CS-5)", () => {
    const env = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = "production";
      expect(controlledListLive()).toBe(false);
      process.env.VERCEL_ENV = "preview";
      expect(controlledListLive()).toBe(true);
    } finally {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
    }
  });

  it("over the EMHSLU 2023 seed: every listed substance is in the catalogue, and these medicines become controlled", () => {
    const { rows } = readNationalList(
      readFileSync("data/pharmacy/national-list/emhslu-2023.csv", "utf8"),
    );
    const meds = seedFromEmhslu(rows).medicines;
    const keys = new Set(meds.flatMap((m) => m.ingredients.map((i) => i.substanceKey)));
    for (const s of CONTROLLED_SUBSTANCES)
      expect(
        s.matches.some((m) => keys.has(m)),
        s.substance,
      ).toBe(true);
    const controlled = meds
      .map(
        (m) =>
          [
            m.displayName,
            controlledIngredient(ing(...m.ingredients.map((i) => i.substanceKey)))?.class,
          ] as const,
      )
      .filter(([, c]) => c)
      .map(([n, c]) => `${n} · ${c}`)
      .sort();
    expect(controlled).toEqual([
      "Alprazolam 0.5 mg tablet · psychotropic",
      "Buprenorphine 400 μg tablet · policy",
      "Clonazepam 2 mg tablet · psychotropic",
      "Codeine 30 mg tablet · narcotic",
      "Diazepam 2 mg/ml rectal tube · psychotropic",
      "Diazepam 2 mg/ml rectal · psychotropic",
      "Diazepam 2.5 mg suppository · psychotropic",
      "Diazepam 5 mg tablet · psychotropic",
      "Diazepam 5 mg/ml injection · psychotropic",
      "Fentanyl 50 μg/ml injection · narcotic",
      "Ketamine 50 mg/ml injection · policy",
      "Lorazepam 4 mg/ml injection · policy",
      "Methadone 10mg/5ml oral liquid · narcotic",
      "Methylphenidate 5 mg tablet · psychotropic",
      "Midazolam 2 mg/ml injection · psychotropic",
      "Morphine (concentrated) 20 mg/ml oral solution · narcotic",
      "Morphine 10 mg/5ml oral solution · narcotic",
      "Morphine 10 mg/ml injection · narcotic",
      "Morphine 50mg/5mls oral solution · narcotic",
      "Morphine 5mg/5mls oral solution · narcotic",
      "Pethidine 50 mg/ml injection · narcotic",
      "Phenobarbital 200 mg/ml injection · psychotropic",
      "Phenobarbital 30 mg tablet · psychotropic",
      "Thiopental sodium 500 mg powder for injection · policy",
      "Tramadol 50 mg capsule · policy",
      "Tramadol 50 mg/ml injection · policy",
    ]);
  });
});
