/**
 * Content-package checksum — the same answer from Deno, Next and Expo, with
 * ZERO IMPORTS (no node:crypto, no TextEncoder: Hermes has neither
 * guaranteed). FNV-1a 64-bit over a canonical JSON serialisation (keys
 * sorted at every depth), hashed by UTF-16 code unit so the three runtimes
 * cannot disagree on byte encoding.
 *
 * Why it exists (ADR 0098 ruling 4): `catalog.v0.1.ts` is generated from
 * the JSON and carries this checksum; a test recomputes it from the JSON so
 * a hand edit to either side fails loudly. Every submission stamps it, so
 * the advice given can be reconstructed against the exact content later.
 * Not a security primitive — a drift detector.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** JSON with object keys sorted at every depth. Arrays keep their order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((k) => record[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** `sha256:`-style prefixed so a reader knows the algorithm: `fnv1a64:<16 hex>`. */
export function catalogChecksum(pkg: unknown): string {
  const text = canonicalJson(pkg);
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = ((hash ^ BigInt(unit >> 8)) * FNV_PRIME) & MASK_64;
    hash = ((hash ^ BigInt(unit & 0xff)) * FNV_PRIME) & MASK_64;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}
