import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";

/**
 * One catalogue medicine as the picker (4.2) and Set-up › Catalogue (4.5) show it (catalogue slice Step 3): its
 * names, form, routes, list facts and packs. Read-only; the caller picks the connection (RLS). No dose, no limit:
 * the catalogue holds what is printed on the pack.
 */

export interface MedicineName {
  name: string;
  /** "preferred" for a substance's preferred name; else the stored type (INN, BAN, USAN, abbreviation, printed…). */
  type: string;
}

export interface MedicinePack {
  /** Null for "Unbranded · loose": no pack, counted in issue units. */
  packId: string | null;
  productId: string | null;
  brand: string | null;
  maker: string | null;
  description: string;
  ndaNumber: string | null;
  ndaState: string;
  /** The barcode in force here: confirmed for everyone, or this hospital's own link. */
  gtin: string | null;
  /** How many hospitals have a confirmed link to this pack's barcode (0 for a local one). */
  confirmedBy: number;
}

export interface CatalogueMedicine {
  id: string;
  displayName: string;
  kind: "medicine" | "health_supply" | "other";
  form: string | null;
  strength: string | null;
  routes: string[];
  issueUnit: string | null;
  emhsluLevel: string | null;
  emhsluVen: string | null;
  flagged: boolean;
  checkNote: string | null;
  /** On the national list (an EMHSLU row link). */
  onNationalList: boolean;
  /** Linked to the prescribing list; only then prescribable (D-CAT-03). */
  prescribable: boolean;
  names: MedicineName[];
  packs: MedicinePack[];
}

type Database = EmrDb | EmrTx;

export async function catalogueMedicine(
  db: Database,
  id: string,
  hospitalId: string,
): Promise<CatalogueMedicine | null> {
  const [m] = rowsOf<{
    id: string;
    display_name: string;
    kind: CatalogueMedicine["kind"];
    form: string | null;
    strength_text: string | null;
    issue_unit_kind: string | null;
    emhslu_level: string | null;
    emhslu_ven: string | null;
    flagged: boolean;
    check_note: string | null;
    routes: string[] | null;
    on_list: boolean;
    prescribable: boolean;
  }>(
    await db.execute(sql`
      SELECT m.id, m.display_name, m.kind, f.label AS form, m.strength_text, m.issue_unit_kind, m.emhslu_level,
             m.emhslu_ven, m.flagged, m.check_note,
             (SELECT array_agg(r.label ORDER BY r.label) FROM public.cat_medicine_routes mr
                JOIN public.cat_routes r ON r.code = mr.route_code WHERE mr.medicine_id = m.id) AS routes,
             EXISTS (SELECT 1 FROM public.cat_medicine_links l WHERE l.medicine_id = m.id AND l.link_kind = 'emhslu_row') AS on_list,
             EXISTS (SELECT 1 FROM public.cat_medicine_links l WHERE l.medicine_id = m.id AND l.link_kind = 'formulary') AS prescribable
        FROM public.cat_medicines m LEFT JOIN public.cat_dose_forms f ON f.code = m.dose_form_code
       WHERE m.id = ${id}`),
  );
  if (!m) return null;

  // Preferred names first (in ingredient order), then each substance's other names, then the medicine's own.
  const names = rowsOf<MedicineName>(
    await db.execute(sql`
      SELECT name, type FROM (
        SELECT s.preferred_name AS name, 'preferred' AS type, i.position AS o, 0 AS g
          FROM public.cat_medicine_ingredients i JOIN public.cat_substances s ON s.id = i.substance_id
         WHERE i.medicine_id = ${id}
        UNION ALL
        SELECT n.name, n.type, i.position, 1
          FROM public.cat_medicine_ingredients i JOIN public.cat_substance_names n ON n.substance_id = i.substance_id
         WHERE i.medicine_id = ${id}
        UNION ALL
        SELECT mn.name, mn.type, 0, 2 FROM public.cat_medicine_names mn WHERE mn.medicine_id = ${id}
      ) x ORDER BY g, o, name`),
  );
  const seen = new Set<string>();
  const unique = names.filter((n) => {
    const k = n.name.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });

  const packs = rowsOf<{
    pack_id: string;
    product_id: string;
    brand_name: string | null;
    maker: string | null;
    description: string;
    nda_number: string | null;
    nda_state: string;
    gtin: string | null;
    confirmed_by: number;
  }>(
    await db.execute(sql`
      SELECT k.id AS pack_id, p.id AS product_id, p.brand_name, f.name AS maker, k.description, p.nda_number,
             p.nda_state,
             (SELECT c.code FROM public.cat_pack_codes c WHERE c.pack_id = k.id AND c.code_type = 'GTIN'
                 AND ((c.hospital_id IS NULL AND c.state = 'confirmed') OR (c.hospital_id = ${hospitalId} AND c.state = 'local'))
               ORDER BY c.state = 'local' DESC LIMIT 1) AS gtin,
             (SELECT count(*)::int FROM public.cat_pack_codes c WHERE c.pack_id = k.id AND c.state = 'confirmed') AS confirmed_by
        FROM public.cat_products p
        JOIN public.cat_packs k ON k.product_id = p.id AND k.status = 'active'
        LEFT JOIN public.cat_manufacturers f ON f.id = p.manufacturer_id
       WHERE p.medicine_id = ${id} AND p.status = 'active'`),
  );
  // Packs with a known barcode first, then the rest by brand; "Unbranded · loose" last (4.2). The hospital's own
  // packs lead once products link to packs (Step 6).
  packs.sort(
    (a, b) =>
      Number(!a.gtin) - Number(!b.gtin) ||
      (a.brand_name ?? "").localeCompare(b.brand_name ?? "") ||
      a.description.localeCompare(b.description),
  );

  return {
    id: m.id,
    displayName: m.display_name,
    kind: m.kind,
    form: m.form,
    strength: m.strength_text,
    routes: m.routes ?? [],
    issueUnit: m.issue_unit_kind,
    emhsluLevel: m.emhslu_level,
    emhsluVen: m.emhslu_ven,
    flagged: m.flagged,
    checkNote: m.check_note,
    onNationalList: m.on_list,
    prescribable: m.prescribable,
    names: unique,
    packs: [
      ...packs.map((p) => ({
        packId: p.pack_id,
        productId: p.product_id,
        brand: p.brand_name,
        maker: p.maker,
        description: p.description,
        ndaNumber: p.nda_number,
        ndaState: p.nda_state,
        gtin: p.gtin,
        confirmedBy: p.confirmed_by,
      })),
      {
        packId: null,
        productId: null,
        brand: null,
        maker: null,
        description: m.issue_unit_kind ?? "",
        ndaNumber: null,
        ndaState: "unknown",
        gtin: null,
        confirmedBy: 0,
      },
    ],
  };
}
