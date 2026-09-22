/**
 * One door into the content package for Deno (`../_shared/symptom-catalog/index.ts`).
 * Web and phone import the files by name (`.../symptom-catalog/classify`,
 * `.../catalog.v0.1`) as they do every other `_shared` module: their
 * tsconfigs reject `.ts` value re-exports (TS5097), and Deno needs them.
 */
export * from "./types.ts";
export * from "./classify.ts";
export { CATALOG, CATALOG_CHECKSUM } from "./catalog.v0.1.ts";
export { canonicalJson, catalogChecksum } from "./checksum.ts";
