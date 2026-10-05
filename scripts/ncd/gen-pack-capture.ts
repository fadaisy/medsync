/* eslint-disable no-console */
/**
 * The diabetes pack's capture additions (go-live, NCD_DM_PACK_LIVE): the form sections and fields the pack reads
 * that the live v0.1.0 form does not ask. Fields the live form already captures under another code or shape are
 * not added; `lib/ncd/pack/live.ts` maps them (Phase 0 feature map). Generated from the pack's own catalog:
 *
 *   npx tsx scripts/ncd/gen-pack-capture.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIABETES_CATALOG } from "@/lib/ncd/catalog/diabetes";
import { MAPPED_FROM_LIVE, PACK_ONLY_CODE } from "@/lib/ncd/pack/live";

export const PACK_CAPTURE_SOURCE = "docs/ncd/diabetes/pack-0.3.0-draft/catalog";
export const PACK_CAPTURE_OUTPUT = "data/ncd/diabetes-pack-capture.json";

const FEATURE_KEYS = [
  "code",
  "display",
  "kind",
  "valueType",
  "unit",
  "options",
  "requires",
  "section",
  "group",
  "parent",
  "showWhen",
  "showWhenAll",
  "showWhenAny",
  "ageBands",
  "computed",
  "restrictedClass",
  "dangerSign",
  "hint",
] as const;

/** Groups for the pack's added questions in grouped sections (the live form groups all of a section or none). */
const GROUP: Record<string, string> = {
  pruritus: "skin_and_healing",
  cough_over_2_weeks: "skin_and_healing",
  wasting: "classic",
  weakness: "classic",
  hyperglycaemic_crisis_now: "crisis",
  diarrhoea: "crisis",
  never_glucose_tested: "rc_person",
  fh_diabetes_first_degree: "rc_person",
  prior_macrosomia_or_stillbirth: "rc_pregnancy",
  polyhydramnios: "rc_pregnancy",
  glycosuria: "rc_pregnancy",
  fetus_large_for_dates: "rc_pregnancy",
};

export function generatePackCapture(root: string) {
  const read = (f: string) => JSON.parse(readFileSync(join(root, PACK_CAPTURE_SOURCE, f), "utf8"));
  const runtime = JSON.parse(readFileSync(join(root, "data/ncd/diabetes-pack.json"), "utf8"))
    .features as Record<string, unknown>;
  const live = new Map(DIABETES_CATALOG.features.map((f) => [f.code, f]));
  const liveSections = new Set(DIABETES_CATALOG.sections.map((s) => s.id));
  const pack = read("01-features.json").features as Record<string, unknown>[];
  const sectionsAll = read("00-capabilities-sections.json").sections as Record<string, unknown>[];
  const features = pack
    .filter((f) => (f.code as string) in runtime && !MAPPED_FROM_LIVE.has(f.code as string))
    .filter(
      (f) => !live.has(f.code as string) || live.get(f.code as string)!.valueType !== f.valueType,
    )
    .map((f) => {
      const out: Record<string, unknown> = {};
      for (const k of FEATURE_KEYS) if (f[k] !== undefined && f[k] !== null) out[k] = f[k];
      const code = f.code as string;
      if (live.has(code)) out.code = PACK_ONLY_CODE[code] ?? `${code}_pack`;
      if (out.parent)
        delete out.group; // a property inherits its finding's group
      else if (!out.group && GROUP[code]) out.group = GROUP[code];
      return out;
    });
  const used = new Set(features.map((f) => f.section as string));
  const sections = sectionsAll
    .filter((s) => used.has(s.id as string) && !liveSections.has(s.id as string))
    .map(({ x: _x, ...s }) => s);
  const liveCaps = new Set(DIABETES_CATALOG.capabilities.map((c) => c.code));
  const needed = new Set(features.map((f) => f.requires as string | undefined).filter(Boolean));
  const capabilities = (
    read("00-capabilities-sections.json").capabilities as Record<string, unknown>[]
  )
    .filter((c) => needed.has(c.code as string) && !liveCaps.has(c.code as string))
    .map(({ x: _x, ...c }) => c);
  return {
    generatedFrom:
      "MS-NCD-DM-PACK-001 catalog/00-capabilities-sections.json, catalog/01-features.json",
    capabilities,
    sections,
    features,
  };
}

if (process.argv[1]?.endsWith("gen-pack-capture.ts")) {
  const root = process.cwd();
  const out = generatePackCapture(root);
  writeFileSync(join(root, PACK_CAPTURE_OUTPUT), JSON.stringify(out, null, 1) + "\n");
  console.log(
    `wrote ${PACK_CAPTURE_OUTPUT}: ${out.sections.length} sections, ${out.features.length} fields`,
  );
}
