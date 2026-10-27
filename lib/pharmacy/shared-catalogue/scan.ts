import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { Scan } from "@/lib/pharmacy/stores/scan";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";
import { parseGs1 } from "@/lib/pharmacy/stores/scan";

/**
 * What a scan is (catalogue slice Step 5; GATE A §6). Parse (Appendix B), then resolve in order: the hospital's own
 * product (its `gtin`), the hospital's local link, the shared link, else unknown. A conflicted code resolves to
 * nothing and lists its packs, so the person picks (S15). A code that is not GS1 is looked up as an NMS, JMS or
 * supplier code. Read-only; read as the viewer, so RLS shows only the shared links and this hospital's (0254).
 */

type Parsed = Extract<Scan, { ok: true }>;
export type ScanResolution =
  | { kind: "refused"; reason: "check_digit" }
  | { kind: "product"; productId: string; scan: Parsed | null }
  | {
      kind: "pack";
      packId: string;
      medicineId: string;
      via: "local" | "shared";
      scan: Parsed | null;
    }
  | { kind: "conflict"; packIds: string[]; scan: Parsed | null }
  | { kind: "unknown"; scan: Parsed }
  | { kind: "text"; text: string };

type Database = EmrDb | EmrTx;

export async function resolveScan(
  db: Database,
  hospitalId: string,
  raw: string,
): Promise<ScanResolution> {
  const s = parseGs1(raw);
  if (!s.ok && s.reason === "check_digit") return { kind: "refused", reason: "check_digit" };
  const scan = s.ok ? s : null;
  const codeType = scan?.gtin ? "GTIN" : null;
  const code = scan?.gtin ?? raw.trim().replace(/\s+/g, "");
  if (!scan && (code.length < 2 || code.length > 80)) return { kind: "text", text: raw.trim() };
  if (scan && !scan.gtin) return { kind: "unknown", scan };

  if (codeType) {
    const own = rowsOf<{ id: string }>(
      await db.execute(sql`SELECT id FROM public.pharmacy_products
        WHERE hospital_id = ${hospitalId} AND active AND gtin = ${code}`),
    );
    if (own.length === 1) return { kind: "product", productId: own[0]!.id, scan };
    if (own.length > 1) return { kind: "conflict", packIds: [], scan };
  }

  const links = rowsOf<{
    pack_id: string;
    medicine_id: string;
    hospital_id: string | null;
    state: string;
  }>(
    await db.execute(sql`
      SELECT c.pack_id, p.medicine_id, c.hospital_id, c.state
        FROM public.cat_pack_codes c
        JOIN public.cat_packs k ON k.id = c.pack_id
        JOIN public.cat_products p ON p.id = k.product_id
       WHERE c.code = ${code}
         AND ${codeType ? sql`c.code_type = 'GTIN'` : sql`c.code_type IN ('NMS','JMS','supplier','other')`}
         AND c.state IN ('local','confirmed','conflict')
         AND (c.hospital_id IS NULL OR c.hospital_id = ${hospitalId})`),
  );
  const conflicted = links.filter((l) => l.state === "conflict");
  if (conflicted.length)
    return { kind: "conflict", packIds: [...new Set(conflicted.map((l) => l.pack_id))], scan };
  const hit =
    links.find((l) => l.state === "local" && l.hospital_id === hospitalId) ??
    links.find((l) => l.state === "confirmed" && l.hospital_id === null);
  if (hit)
    return {
      kind: "pack",
      packId: hit.pack_id,
      medicineId: hit.medicine_id,
      via: hit.hospital_id ? "local" : "shared",
      scan,
    };
  return scan ? { kind: "unknown", scan } : { kind: "text", text: raw.trim() };
}
