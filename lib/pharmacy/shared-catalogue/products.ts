import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";

/**
 * Set-up › Catalogue › Your products (catalogue slice Step 6, S17): each of the hospital's products not yet linked,
 * with the catalogue medicines it could be. A suggestion comes only from a signed link: the product's prescribing
 * medicine linked in the catalogue, or its national-list row linked to a catalogue medicine. One candidate is
 * "single" and may be confirmed in a batch; several are "choose"; none is "none". Never by name alone.
 */

export interface ProductLinkRow {
  productId: string;
  name: string;
  strength: string | null;
  itemKind: string;
  candidates: { medicineId: string; displayName: string; via: "formulary" | "national_list" }[];
  match: "single" | "choose" | "none";
}

export async function productLinkRows(
  db: EmrDb | EmrTx,
  hospitalId: string,
): Promise<ProductLinkRow[]> {
  const rows = rowsOf<{
    id: string;
    name: string;
    strength: string | null;
    item_kind: string;
    medicine_id: string | null;
    display_name: string | null;
    via: "formulary" | "national_list" | null;
  }>(
    await db.execute(sql`
      SELECT p.id, p.name, p.strength, p.item_kind, c.medicine_id, c.display_name, c.via
        FROM public.pharmacy_products p
        LEFT JOIN LATERAL (
          SELECT DISTINCT ON (m.id) m.id AS medicine_id, m.display_name, x.via
            FROM (
              SELECT l.medicine_id, 'formulary' AS via, 0 AS o FROM public.cat_medicine_links l
               WHERE l.link_kind = 'formulary' AND l.formulary_id = p.medicine_id
              UNION ALL
              SELECT l.medicine_id, 'national_list', 1 FROM public.pharmacy_medicine_links n
                JOIN public.cat_medicine_links l ON l.link_kind = 'emhslu_row' AND l.row_id = n.row_id
               WHERE n.medicine_id = p.medicine_id
            ) x JOIN public.cat_medicines m ON m.id = x.medicine_id AND m.status = 'active'
           ORDER BY m.id, x.o) c ON p.item_kind = 'formulary'
       WHERE p.hospital_id = ${hospitalId} AND p.active AND p.catalogue_medicine_id IS NULL
       ORDER BY p.name, c.display_name`),
  );
  const out = new Map<string, ProductLinkRow>();
  for (const r of rows) {
    const row = out.get(r.id) ?? {
      productId: r.id,
      name: r.name,
      strength: r.strength,
      itemKind: r.item_kind,
      candidates: [],
      match: "none" as const,
    };
    if (r.medicine_id && r.display_name && r.via)
      row.candidates.push({ medicineId: r.medicine_id, displayName: r.display_name, via: r.via });
    row.match = row.candidates.length === 1 ? "single" : row.candidates.length ? "choose" : "none";
    out.set(r.id, row);
  }
  return [...out.values()];
}
