import type { Scan } from "./scan";

import { STORE } from "@/content/pharmacy-stores-store";
import { parseGs1, productForGtin } from "./scan";

/**
 * What a keyboard-wedge scan fills on a store screen (Pharmacy Phase 2, 5.11, SC-1 to SC-3). Pure: the parser and
 * the GTIN lookup are scan.ts's; this only says what to prefill and, for a scan that is not GS1, keeps it as typed
 * text (SC-2), which then finds a product by name when exactly one matches. Nothing requires a scan.
 */

export interface ScanProduct {
  id: string;
  name: string;
  gtin: string | null;
  active: boolean;
}

export type ScanOutcome =
  | { kind: "gs1"; scan: Extract<Scan, { ok: true }>; productId: string | null; note: string }
  | { kind: "text"; text: string; note: string };

/** An expiry for the text field: a month the pack gives stays a month (Phase 1 stores it as the month). */
export const expiryForField = (s: { expiry: string | null; expiryMonthOnly: boolean }) =>
  s.expiry === null ? "" : s.expiryMonthOnly ? s.expiry.slice(0, 7) : s.expiry;

/** 5.11, SC-1 to SC-3: what a scan (or typed text) gives. */
export function readScan(raw: string, products: readonly ScanProduct[]): ScanOutcome {
  const s = parseGs1(raw);
  if (!s.ok) return { kind: "text", text: raw.trim(), note: STORE.scan.asText };
  const hit = s.gtin ? productForGtin(products, s.gtin) : null;
  const parts = [
    s.gtin ? `GTIN ${s.gtin}` : null,
    s.batch ? `batch ${s.batch}` : null,
    s.expiry ? `expiry ${expiryForField(s)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const note =
    hit && !hit.ok
      ? `${STORE.scan.read(parts)} ${hit.reason === "ambiguous" ? STORE.scan.ambiguous : STORE.scan.unknownGtin}`
      : STORE.scan.read(parts);
  return { kind: "gs1", scan: s, productId: hit?.ok ? hit.productId : null, note };
}

/** SC-2: typed (or non-GS1) text picks a product only when exactly one name contains it. */
export function productByText<P extends { id: string; name: string }>(
  products: readonly P[],
  text: string,
): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const hits = products.filter((p) => p.name.toLowerCase().includes(t));
  return hits.length === 1 ? hits[0]!.id : null;
}
