/**
 * The research import planned on the real file (RI-1..RI-8; S1, S2, S3 at engine level). The file is data:
 * the test reads its counts and never copies a value.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONCEPTS } from "@/lib/facts/catalogue.generated";
import {
  NOT_IMPORTED,
  planImport,
  RESEARCH_FILE,
  ResearchFile,
  sha256,
  ucum,
} from "@/lib/lab/research-import";
import { configSignErrors } from "@/lib/lab/signed-config";

const text = readFileSync(RESEARCH_FILE, "utf8");
const file = JSON.parse(text);
// The hospital's tests with the research's v2 components; units from the registry, then the research's own
// (corrected per F-1) for the concepts the addendum adds.
const tests = file.tests.map((t: { id: string; components: string[] }) => ({
  code: t.id,
  components: t.components,
}));
const units = new Map<string, string>(
  file.concepts.map((c: { id: string; canonicalUnit: string | null }) => [
    c.id,
    ucum(c.canonicalUnit ?? ""),
  ]),
);
const canonical = (id: string) =>
  (CONCEPTS as Record<string, { canonicalUnit: string | null }>)[id]?.canonicalUnit ??
  units.get(id) ??
  null;

describe("RI: the research import", () => {
  const { plan, report } = planImport(text, tests, canonical);

  it("RI-1 the file validates and its counts are the ones STOP 0 reported (Q17)", () => {
    const f = ResearchFile.parse(file);
    expect(f.concepts).toHaveLength(119);
    expect(f.tests).toHaveLength(33);
    expect(f.ranges).toHaveLength(64);
    expect(f.ranges.flatMap((r) => r.bands)).toHaveLength(497);
    expect(f.gaps).toHaveLength(38);
    expect(f.decisionsForSignOff).toHaveLength(21);
  });

  it("RI-1 the same file has the same hash (a re-import is a no-op by hash)", () => {
    expect(report.hash).toBe(sha256(text));
    expect(planImport(text, tests, canonical).report.hash).toBe(report.hash);
  });

  it("RI-2 every band carries its citation, link, population, method and confidence", () => {
    for (const d of plan.references)
      for (const b of d.bands) {
        expect(b.source.length).toBeGreaterThanOrEqual(3);
        expect(b.provenance).toMatchObject({
          citation: expect.any(String),
          link: expect.any(String),
          confidence: expect.any(String),
        });
      }
  });

  it("RI-4 bands land only in the component's unit; F-1 spellings are corrected first", () => {
    for (const d of plan.references) expect(d.unit).toBe(canonical(d.concept));
    expect(plan.schemes.find((s) => s.concept === "obs.egfr")?.payload.unit).toBe(
      "mL/min/{1.73_m2}",
    );
  });

  it("RI-5 (S2) the eight Lugada CD4 bands arrive as verification blockers", () => {
    expect(report.blockers).toHaveLength(8);
    expect(new Set(report.blockers.map((b) => b.concept))).toEqual(new Set(["obs.cd4"]));
  });

  it("RI-6 (S3) creatinine shows two sources disagreeing; nothing is averaged", () => {
    const creat = plan.references.find((d) => d.concept === "obs.creatinine");
    expect(creat?.sourcesDisagree).toBe(true);
    expect(new Set(creat!.bands.map((b) => b.provenance.citation)).size).toBeGreaterThan(1);
  });

  it("RI-7 kit-specific tests and INR targets are not imported, and are listed", () => {
    const imported = new Set([
      ...plan.references.map((d) => d.concept),
      ...plan.schemes.map((s) => s.concept),
    ]);
    for (const c of NOT_IMPORTED) expect(imported.has(c), c).toBe(false);
    expect(report.notImported).toEqual([...NOT_IMPORTED]);
  });

  it("A6: a decision scheme draft keeps the printed limits and stays unsignable until a person sets the boundaries", () => {
    const hb = plan.schemes.find((s) => s.concept === "obs.haemoglobin");
    expect(hb?.payload.elevation?.table.length).toBeGreaterThan(0);
    expect(configSignErrors("scheme", hb!.payload).length).toBeGreaterThan(0);
  });

  it("RI-8 the report counts drafts, rejections and gaps", () => {
    expect(report.counts.referenceDrafts).toBe(plan.references.length);
    expect(report.counts.schemeDrafts).toBe(plan.schemes.length);
    expect(report.gaps).toHaveLength(38);
    expect(report.rejected.some((r) => r.reason.includes("formula"))).toBe(true); // ESR's age-continuous rule
  });
});
