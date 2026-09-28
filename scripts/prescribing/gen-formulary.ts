/* eslint-disable no-console */
/**
 * Generates lib/prescribing/reference/general-formulary.ts from the MS-RX-CAT-001 JSON (ADR 0187).
 * The JSON is the source; the TS is a typed copy. tests/prescribing/general-formulary.test.ts fails
 * while the two drift.
 *
 *   npx tsx scripts/prescribing/gen-formulary.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import prettier from "prettier";

export const FORMULARY_SOURCE = "data/prescribing/drug-catalogue.v0.json";
export const FORMULARY_OUTPUT = "lib/prescribing/reference/general-formulary.ts";

export function readFormularySource(root: string) {
  return JSON.parse(readFileSync(join(root, FORMULARY_SOURCE), "utf8")) as Record<string, unknown>;
}

function buildTs(cat: Record<string, unknown>): string {
  const meta = {
    id: cat.id,
    version: cat.version,
    createdAt: cat.createdAt,
    status: cat.status,
    diagnosisCatalogue: cat.diagnosisCatalogue,
  };
  const j = (v: unknown) => JSON.stringify(v, null, 2);
  return `// GENERATED — do not edit. Source: ${FORMULARY_SOURCE} (MS-RX-CAT-001, draft).
// Regenerate with \`npx tsx scripts/prescribing/gen-formulary.ts\`; tests/prescribing/general-formulary.test.ts fails while it drifts.
/**
 * The general formulary as typed data (ADR 0187). Draft: no doses. Every drug's dose is
 * \`to-verify\`; the signed emergency regimens are laid over three entries by formulary-regimens.ts,
 * never written here. Brand names are never shown; strengths come from the pharmacy system.
 */
import type {
  AllergyGroup,
  DiagnosisLink,
  Drug,
  DrugClass,
  DrugSystem,
  FormularyMeta,
  SupportiveItem,
} from "./formulary-types";

export const FORMULARY_META: FormularyMeta = ${j(meta)};

export const DRUG_SYSTEMS: readonly DrugSystem[] = ${j(cat.systems)};

export const ALLERGY_GROUPS: readonly AllergyGroup[] = ${j(cat.allergyGroups)};

export const DRUG_CLASSES: readonly DrugClass[] = ${j(cat.classes)};

export const FORMULARY_DRUGS: readonly Drug[] = ${j(cat.drugs)};

export const SUPPORTIVE_ITEMS: readonly SupportiveItem[] = ${j(cat.supportive)};

export const DIAGNOSIS_LINKS: readonly DiagnosisLink[] = ${j(cat.diagnosisLinks)};
`;
}

export async function generateFormulary(root: string): Promise<string> {
  const out = join(root, FORMULARY_OUTPUT);
  const config = (await prettier.resolveConfig(out)) ?? {};
  return prettier.format(buildTs(readFormularySource(root)), { ...config, filepath: out });
}

if (process.argv[1]?.endsWith("gen-formulary.ts")) {
  const root = process.cwd();
  generateFormulary(root).then((ts) => {
    writeFileSync(join(root, FORMULARY_OUTPUT), ts);
    console.log(`wrote ${FORMULARY_OUTPUT}`);
  });
}
