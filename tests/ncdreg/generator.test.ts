/**
 * §6/§10.4: the seeded generator is deterministic (same seed, day 0 and size → identical output),
 * emits only synthetic adults in the DEMO-1xxxx series, never reuses a scenario patient's full name or
 * number, and writes only catalogue-shaped records (they validate against the catalogue schema).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCatalogue, scenarioPatient } from "@/lib/ncdreg/demo/catalogue";
import { generatePatients } from "@/lib/ncdreg/fixtures/generator";
import { FULL_ROLES } from "@/lib/ncdreg/standard/conditions";

const cat = parseCatalogue(
  JSON.parse(
    readFileSync(resolve(__dirname, "../../docs/ncd/demo/ncd-demo-catalog.v1.json"), "utf8"),
  ),
);
const opts = (seed: number, size = 300) => ({
  seed,
  day0: "2026-10-05",
  size,
  existing: 0,
  spec: cat.generator as never,
  bpModule: FULL_ROLES.bp,
  glucoseModule: FULL_ROLES.glycaemic,
  reservedNames: new Set(cat.scenario_patients.map((p) => `${p.given_name} ${p.family_name}`)),
  reservedPhones: new Set(
    cat.scenario_patients.map((p) => p.phone_1).filter((x): x is string => !!x),
  ),
});

describe("seeded generator", () => {
  it("same seed, day 0 and size → identical output; another seed differs", () => {
    const a = JSON.stringify(generatePatients(opts(cat.generator.seed)));
    expect(JSON.stringify(generatePatients(opts(cat.generator.seed)))).toBe(a);
    expect(JSON.stringify(generatePatients(opts(cat.generator.seed + 1)))).not.toBe(a);
  });

  it("terminates when a sex's name pairs run out (the 2,000-patient performance set, seed 7)", () => {
    const t = performance.now();
    expect(generatePatients(opts(7, 2000)).length).toBeGreaterThanOrEqual(2000);
    expect(performance.now() - t).toBeLessThan(5_000);
  });

  const gen = generatePatients(opts(cat.generator.seed, 1300));
  it("every person is synthetic, adult, DEMO-1xxxx, catalogue-shaped", () => {
    for (const p of gen) {
      expect(p.is_synthetic).toBe(true);
      expect(p.registry_number).toMatch(/^DEMO-1\d{4}$/);
      expect(p.age_years_at_day_0).toBeGreaterThanOrEqual(20);
      expect(() => scenarioPatient.parse(p)).not.toThrow();
      for (const v of p.visits) expect(v.day).toBeLessThan(0);
    }
  });
  it("never reproduces a scenario patient's full name or phone number", () => {
    const names = new Set(cat.scenario_patients.map((p) => `${p.given_name} ${p.family_name}`));
    const phones = new Set(cat.scenario_patients.map((p) => p.phone_1));
    for (const p of gen) {
      expect(names.has(`${p.given_name} ${p.family_name}`)).toBe(false);
      if (p.phone_1) {
        expect(phones.has(p.phone_1)).toBe(false);
        expect(p.phone_1).toMatch(/^0700 00\d \d{3}$/);
      }
    }
    const ph = gen.map((p) => p.phone_1).filter(Boolean);
    expect(new Set(ph).size).toBe(ph.length);
  });
});
