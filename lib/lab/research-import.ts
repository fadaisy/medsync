/**
 * The research import, planned (Lab Phase 2 §6.5, rules RI-1 to RI-8; D-LAB2-23; ADR 0253). Pure.
 *
 * Reads the committed research file (docs/lab/catalogue-research/lab-catalogue-research.v1.json), checks it
 * against its own conventions, and plans what one hospital's Reference ranges receive: reference-interval
 * drafts (every band with its source, population, method and confidence; a `verification` band arrives
 * locked) and decision-scheme drafts. Nothing is signed, in force or orderable afterwards (RI-3). Disagreeing
 * sources stay side by side for the laboratory lead to choose (RI-6); nothing is averaged. Kit-specific tests
 * are not imported (RI-7, LD-08), nor INR targets (LD-09). A decision band's free-text inclusivity is never
 * guessed: the scheme draft takes each band's printed limits as written, and the tiling check
 * (configSignErrors) keeps it unsignable until a person sets every boundary (STOP 0 A6).
 */
import { createHash } from "node:crypto";
import type { SchemePayload } from "@/lib/lab/signed-config";
import { z } from "zod";

export const RESEARCH_FILE = "docs/lab/catalogue-research/lab-catalogue-research.v1.json";

const num = z.number().nullable();
const Band = z.object({
  sex: z.enum(["female", "male", "any"]),
  ageFromDays: z.number().int().min(0).nullable(),
  ageToDays: z.number().int().min(1).nullable(),
  low: num,
  high: num,
  source: z.object({
    citation: z.string(),
    where: z.string().nullable().optional(),
    link: z.string(),
  }),
  population: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  confidence: z.string(),
  reason: z.string().nullable().optional(),
  strand: z.string().optional(),
  label: z.string().nullable().optional(),
  scheme: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  boundary: z.string().nullable().optional(),
  formula: z.string().nullable().optional(),
  verification: z.string().nullable().optional(),
});
const Range = z.object({
  concept: z.string(),
  unit: z.string(),
  kind: z.enum(["reference", "decision"]),
  bands: z.array(Band).min(1),
  adjustments: z
    .object({
      altitude: z
        .object({
          source: z.object({
            citation: z.string(),
            where: z.string().optional(),
            link: z.string(),
          }),
          table: z.array(
            z.object({
              elevationFromM: z.number(),
              elevationToM: z.number(),
              addToCutoffGL: z.number(),
            }),
          ),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
});
/** RI-1: the file's shape, from its `conventions`. */
export const ResearchFile = z.object({
  researchedOn: z.string(),
  concepts: z.array(
    z
      .object({
        id: z.string(),
        canonicalUnit: z.string().nullable(),
        // An affine unit carries a formula and no factor; one concept lists a bare unit string.
        otherUnits: z
          .array(
            z.union([
              z.string(),
              z
                .object({ unit: z.string(), multiplyBy: z.number().nullable().optional() })
                .passthrough(),
            ]),
          )
          .nullable()
          .optional(),
        existing: z.boolean(),
      })
      .passthrough(),
  ),
  tests: z.array(z.object({ id: z.string(), components: z.array(z.string()) }).passthrough()),
  ranges: z.array(Range),
  gaps: z.array(z.string()),
  decisionsForSignOff: z.array(z.unknown()),
});
export type ResearchFile = z.infer<typeof ResearchFile>;

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** F-1: the research's invalid UCUM spellings, mapped to the curated codes. */
const UCUM_FIX: Record<string, string> = {
  "copies/mL": "{copies}/mL",
  "mL/min/1.73m2": "mL/min/{1.73_m2}",
  count: "{count}",
  "log10 copies/mL": "{log_copies}/mL",
  "1": "{ratio}", // F-2: urine SG keeps its signed spelling of the same dimensionless unit
};
export const ucum = (u: string) => UCUM_FIX[u] ?? u;

/** RI-7, LD-08, LD-09: concepts the lab enters from its own kit insert or the patient's plan. */
export const NOT_IMPORTED = [
  "obs.troponin",
  "obs.troponin_i_hs",
  "obs.troponin_t_hs",
  "obs.tsh",
  "obs.ft4",
  "obs.ft3",
  "obs.pt",
  "obs.aptt",
  "obs.d_dimer",
  "obs.d_dimer_ddu",
  "obs.inr",
] as const;

export interface ImportBand {
  sex: "female" | "male" | "any";
  ageFromDays: number | null;
  ageToDays: number | null;
  low: string | null;
  high: string | null;
  /** Phase 1's `source` (≤ 500 chars): citation and where. */
  source: string;
  provenance: Record<string, unknown>;
  verification: string | null;
}
export interface ReferenceDraft {
  testCode: string;
  concept: string;
  unit: string;
  bands: ImportBand[];
  /** RI-6: overlapping bands of one sex from different sources. */
  sourcesDisagree: boolean;
  blockers: number;
}
export interface SchemeDraft {
  testCodes: string[];
  concept: string;
  /** The research's scheme label (often the first author of the citation; the lead renames it). */
  label: string;
  payload: SchemePayload;
}
export interface ImportReport {
  hash: string;
  counts: {
    referenceDrafts: number;
    referenceBands: number;
    schemeDrafts: number;
    schemeBands: number;
  };
  rejected: { concept: string; reason: string; bands: number }[];
  notImported: string[];
  blockers: { concept: string; testCode: string; verification: string }[];
  gaps: string[];
}

const dec = (n: number | null) => (n === null ? null : String(n));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * RI-2, RI-4: the plan for one hospital. `tests` are the hospital's tests with their v2 components;
 * `canonicalUnit` is the registry's unit for a concept (null when the concept is unknown here).
 */
export function planImport(
  text: string,
  tests: readonly { code: string; components: readonly string[] }[],
  canonicalUnit: (concept: string) => string | null,
): { plan: { references: ReferenceDraft[]; schemes: SchemeDraft[] }; report: ImportReport } {
  const file = ResearchFile.parse(JSON.parse(text));
  const report: ImportReport = {
    hash: sha256(text),
    counts: { referenceDrafts: 0, referenceBands: 0, schemeDrafts: 0, schemeBands: 0 },
    rejected: [],
    notImported: [...NOT_IMPORTED],
    blockers: [],
    gaps: file.gaps,
  };
  const references: ReferenceDraft[] = [];
  const schemes: SchemeDraft[] = [];
  const concepts = new Map(file.concepts.map((c) => [c.id, c]));

  for (const r of file.ranges) {
    if ((NOT_IMPORTED as readonly string[]).includes(r.concept)) continue;
    const unit = ucum(r.unit);
    const canon = canonicalUnit(r.concept);
    if (!canon || canon !== unit) {
      report.rejected.push({
        concept: r.concept,
        reason: canon
          ? `unit ${unit} is not the component's unit ${canon}`
          : "concept not in this catalogue",
        bands: r.bands.length,
      });
      continue;
    }
    const testCodes = tests.filter((t) => t.components.includes(r.concept)).map((t) => t.code);
    if (!testCodes.length) {
      report.rejected.push({
        concept: r.concept,
        reason: "no test here carries this result",
        bands: r.bands.length,
      });
      continue;
    }
    // RI-4: ages follow RR-4; formula bands (age-continuous rules) are not a band and are listed.
    const ok = r.bands.filter(
      (b) =>
        !b.formula &&
        (b.ageFromDays === null || b.ageToDays === null || b.ageFromDays < b.ageToDays),
    );
    const formula = r.bands.length - ok.length;
    if (formula)
      report.rejected.push({
        concept: r.concept,
        reason: "age-continuous formula: entered by hand",
        bands: formula,
      });
    if (!ok.length) continue;

    if (r.kind === "reference") {
      const bands: ImportBand[] = ok
        .filter((b) => b.low !== null || b.high !== null)
        .map((b) => ({
          sex: b.sex,
          ageFromDays: b.ageFromDays,
          ageToDays: b.ageToDays,
          low: dec(b.low),
          high: dec(b.high),
          source: cut(`${b.source.citation}${b.source.where ? ` — ${b.source.where}` : ""}`, 500),
          provenance: {
            citation: b.source.citation,
            where: b.source.where ?? null,
            link: b.source.link,
            population: b.population ?? null,
            method: b.method ?? null,
            confidence: b.confidence,
            reason: b.reason ?? null,
            strand: b.strand ?? null,
            context: b.context ?? null,
          },
          verification: b.verification ?? null,
        }));
      for (const testCode of testCodes) {
        const disagree = bands.some((a, i) =>
          bands
            .slice(i + 1)
            .some(
              (b) =>
                a.sex === b.sex &&
                a.source !== b.source &&
                (a.ageFromDays ?? 0) < (b.ageToDays ?? Infinity) &&
                (b.ageFromDays ?? 0) < (a.ageToDays ?? Infinity),
            ),
        );
        const blockers = bands.filter((b) => b.verification);
        for (const b of blockers)
          report.blockers.push({ concept: r.concept, testCode, verification: b.verification! });
        references.push({
          testCode,
          concept: r.concept,
          unit,
          bands,
          sourcesDisagree: disagree,
          blockers: blockers.length,
        });
        report.counts.referenceDrafts++;
        report.counts.referenceBands += bands.length;
      }
      continue;
    }

    // Decision bands: one scheme draft per source scheme (LD-04, LD-05 choose one; nothing is merged).
    const bySchemes = new Map<string, typeof ok>();
    for (const b of ok) {
      const k = b.scheme ?? b.source.citation.slice(0, 40);
      bySchemes.set(k, [...(bySchemes.get(k) ?? []), b]);
    }
    for (const [label, bands] of bySchemes) {
      const categories = [
        ...new Set(bands.map((b) => cut(b.label ?? b.context ?? "category", 80))),
      ];
      const code = (l: string) => `c${categories.indexOf(l) + 1}`;
      const rowKey = (b: (typeof bands)[number]) =>
        `${b.sex}|${b.ageFromDays}|${b.ageToDays}|${b.context ?? ""}`;
      const rows = new Map<string, typeof bands>();
      for (const b of bands) rows.set(rowKey(b), [...(rows.get(rowKey(b)) ?? []), b]);
      const alt = r.adjustments?.altitude;
      const gl = concepts
        .get(r.concept)
        ?.otherUnits?.find((u) => typeof u !== "string" && u.unit === "g/L");
      const factor = typeof gl === "object" ? gl.multiplyBy : null;
      const payload: SchemePayload = {
        concept: r.concept,
        unit,
        label: cut(label, 120),
        source: cut(bands[0]!.source.citation, 500),
        categories: categories.map((l) => ({ code: code(l), label: l, abnormal: false })),
        rows: [...rows.values()].map((rb) => ({
          sex: rb[0]!.sex,
          ageFromDays: rb[0]!.ageFromDays,
          ageToDays: rb[0]!.ageToDays,
          context: /pregnan/i.test(rb[0]!.context ?? "")
            ? "pregnant"
            : rb[0]!.context
              ? "any"
              : "not_pregnant",
          methods: ["lab"],
          // As printed: inclusive both ends. A person sets each boundary before signing (A6).
          bounds: rb.map((b) => ({
            category: code(cut(b.label ?? b.context ?? "category", 80)),
            from: dec(b.low),
            fromInclusive: true,
            to: dec(b.high),
            toInclusive: true,
          })),
          source: cut(
            `${rb[0]!.source.citation}${rb[0]!.source.where ? ` — ${rb[0]!.source.where}` : ""}`,
            500,
          ),
        })),
        ...(alt && factor
          ? {
              elevation: {
                unit,
                // The table is printed in g/L; the research's own plain factor puts it in the scheme's unit.
                table: alt.table.map((t) => ({
                  fromM: t.elevationFromM,
                  toM: t.elevationToM,
                  amount: String(t.addToCutoffGL / factor),
                })),
                source: cut(
                  `${alt.source.citation}${alt.source.where ? ` — ${alt.source.where}` : ""}`,
                  500,
                ),
              },
            }
          : {}),
      };
      schemes.push({ testCodes, concept: r.concept, label, payload });
      report.counts.schemeDrafts++;
      report.counts.schemeBands += bands.length;
    }
  }
  return { plan: { references, schemes }, report };
}
