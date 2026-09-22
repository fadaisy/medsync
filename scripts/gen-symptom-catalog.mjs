/* eslint-disable no-console */
/**
 * Generate `supabase/functions/_shared/symptom-catalog/catalog.v0.1.ts` from
 * the JSON content package (catalog.v0.1.json + i18n/en.json). Deterministic —
 * re-run after editing either JSON; a test fails while they drift.
 *
 * Validates nothing on purpose: the Zod schema (lib/symptom-catalog/schema.ts)
 * and tests/symptom-catalog are the gate. This only embeds the content as a
 * typed const and stamps its checksum so all three runtimes can import it
 * without a JSON loader. Output goes through the repo's Prettier config so a
 * regen and the pre-commit hook agree byte-for-byte.
 * Usage: node scripts/gen-symptom-catalog.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const DIR = new URL("../supabase/functions/_shared/symptom-catalog/", import.meta.url);
const read = (rel) => JSON.parse(readFileSync(new URL(rel, DIR), "utf8"));

const pkg = { ...read("catalog.v0.1.json"), en: read("i18n/en.json") };

// Mirror of checksum.ts — kept in step by the drift test, which recomputes
// with the TypeScript function and compares against what this wrote.
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
const checksum = (value) => {
  const text = canonicalJson(value);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = ((hash ^ BigInt(unit >> 8)) * 0x100000001b3n) & 0xffffffffffffffffn;
    hash = ((hash ^ BigInt(unit & 0xff)) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
};

const out = `// GENERATED — do not edit. Source: catalog.v0.1.json + i18n/en.json.
// Regenerate with \`node scripts/gen-symptom-catalog.mjs\`.
/**
 * The patient symptom catalog v${pkg.version} as a typed const, so Deno, Next and
 * Expo all import one artifact without a JSON loader (ADR 0098 ruling 4).
 * Status "${pkg.status}": production renders only a signed version (Gate CS).
 */
import type { CatalogPackage } from "./types.ts";

export const CATALOG = ${JSON.stringify(pkg, null, 2)} satisfies CatalogPackage;

/** Recomputed by the drift test from the JSON with \`catalogChecksum\`. */
export const CATALOG_CHECKSUM = ${JSON.stringify(checksum(pkg))};
`;

const target = fileURLToPath(new URL("catalog.v0.1.ts", DIR));
const options = await prettier.resolveConfig(target);
writeFileSync(target, await prettier.format(out, { ...options, filepath: target }));
console.log(`catalog.v0.1.ts: ${pkg.items.length} items, ${checksum(pkg)}`);
