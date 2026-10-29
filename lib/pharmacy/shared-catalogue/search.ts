import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";

/**
 * Search the shared catalogue and the hospital's own products (catalogue slice Step 3, brief §3.3). Exact codes
 * first (barcode, NDA number, NMS/JMS/supplier code), then names: preferred, other names and abbreviations,
 * brands, makers, and the hospital's product names, through trigram similarity on folded text (0253). Each hit
 * says why it matched. Search terms are never stored. Read-only; the caller picks the connection (RLS).
 */

export type HitGroup = "medicine" | "brand" | "product";
export interface CatalogueHit {
  group: HitGroup;
  id: string;
  /** The medicine a brand or product belongs to, when known. */
  medicineId: string | null;
  title: string;
  detail: string | null;
  kind: "medicine" | "health_supply" | "other" | null;
  /** Why it matched, in words: "Also called acetaminophen", "Barcode 0…", "NDA/MAL/…". Null for a plain name match. */
  why: string | null;
  score: number;
  /** The medicine's form and routes (labels), for the picker's chips. */
  form: string | null;
  routes: string[];
}

export interface SearchOptions {
  hospitalId: string;
  kind?: "medicine" | "health_supply";
  form?: string;
  route?: string;
  /** A prescribing search: medicines linked to the prescribing list only, never a health supply (D-CAT-03, S7). */
  prescribing?: boolean;
  limit?: number;
}

type Database = EmrDb | EmrTx;
type Row = {
  grp: HitGroup;
  id: string;
  medicine_id: string | null;
  title: string;
  detail: string | null;
  kind: CatalogueHit["kind"];
  why: string | null;
  score: number;
};

const medicineFilter = (o: SearchOptions) => sql`
  m.status = 'active'
  ${o.kind ? sql`AND m.kind = ${o.kind}` : sql``}
  ${o.form ? sql`AND m.dose_form_code = ${o.form}` : sql``}
  ${o.route ? sql`AND EXISTS (SELECT 1 FROM public.cat_medicine_routes r WHERE r.medicine_id = m.id AND r.route_code = ${o.route})` : sql``}
  ${
    o.prescribing
      ? sql`AND m.kind = 'medicine' AND EXISTS (SELECT 1 FROM public.cat_medicine_links l
          WHERE l.medicine_id = m.id AND l.link_kind = 'formulary')`
      : sql``
  }`;

/** An 8-, 12-, 13- or 14-digit code as the 14-digit GTIN it encodes. */
export const asGtin14 = (code: string) =>
  /^\d{8}$|^\d{12,14}$/.test(code) ? code.padStart(14, "0") : null;

export async function catalogueSearch(
  db: Database,
  q: string,
  o: SearchOptions,
): Promise<CatalogueHit[]> {
  const text = q.trim().slice(0, 120);
  if (text.length < 2) return [];
  const limit = Math.min(o.limit ?? 30, 60);
  const code = text.replace(/\s+/g, "");
  const gtin = asGtin14(code);
  // The term is folded once, by the function the stored columns use (0253), then passed as plain text.
  const [{ folded }] = rowsOf<{ folded: string }>(
    await db.execute(sql`SELECT coalesce(private.cat_fold(${text}), '') AS folded`),
  ) as [{ folded: string }];
  // Two letters (an abbreviation) match whole names only; three letters also match names by prefix ("cef"), with
  // the exact name still scored first (AL, TLD, ACT); four or more by prefix or similarity.
  const short = folded.length < 4;
  const prefixOnly = folded.length === 3;
  const prefix = `${folded.replace(/[\\%_]/g, "\\$&")}%`;
  const nameMatch = (col: ReturnType<typeof sql>) =>
    prefixOnly
      ? sql`${col} LIKE ${prefix}`
      : short
        ? sql`${col} = ${folded}`
        : sql`(${col} % ${folded} OR ${col} LIKE ${prefix})`;
  const score = (col: ReturnType<typeof sql>) => sql`
    CASE WHEN ${col} = ${folded} THEN 1.0
         WHEN ${col} LIKE ${prefix} THEN 0.9
         ELSE similarity(${col}, ${folded}) END`;
  const brandOf = sql`'brand'::text AS grp, p.id, m.id AS medicine_id, coalesce(p.brand_name, 'Unbranded') AS title,
    m.display_name AS detail, m.kind`;
  const packCode = sql`FROM public.cat_pack_codes c
    JOIN public.cat_packs k ON k.id = c.pack_id
    JOIN public.cat_products p ON p.id = k.product_id
    JOIN public.cat_medicines m ON m.id = p.medicine_id
   WHERE ((c.hospital_id IS NULL AND c.state = 'confirmed') OR (c.hospital_id = ${o.hospitalId} AND c.state = 'local'))
     AND ${medicineFilter(o)}`;

  const parts: ReturnType<typeof sql>[] = [];
  // 1. Exact codes: a barcode, a registration number, an NMS, JMS or supplier code.
  if (gtin) {
    parts.push(sql`SELECT ${brandOf}, 'Barcode ' || c.code AS why, 1.0 AS score ${packCode}
      AND c.code_type = 'GTIN' AND c.code = ${gtin}`);
    if (!o.prescribing)
      parts.push(sql`SELECT 'product'::text, p.id, NULL::uuid, p.name, p.strength, NULL::text,
        'Barcode ' || ${gtin}, 1.0 FROM public.pharmacy_products p
        WHERE p.hospital_id = ${o.hospitalId} AND p.active AND p.gtin = ${gtin}`);
  }
  if (/[0-9]/.test(code) && code.length >= 4) {
    parts.push(sql`SELECT ${brandOf}, 'Registration ' || p.nda_number, 1.0
      FROM public.cat_products p JOIN public.cat_medicines m ON m.id = p.medicine_id
      WHERE upper(regexp_replace(p.nda_number, '\s', '', 'g')) = upper(${code}) AND ${medicineFilter(o)}`);
    parts.push(sql`SELECT ${brandOf},
      CASE c.code_type WHEN 'supplier' THEN 'Supplier' ELSE c.code_type END || ' code ' || c.code, 1.0 ${packCode}
      AND c.code_type IN ('NMS','JMS','supplier','other') AND upper(c.code) = upper(${code})`);
  }
  // 2. Names: preferred and other names (a substance's or a medicine's own), display names, brands, makers,
  // and the hospital's own product names.
  if (folded.length >= 2) {
    // MATERIALIZED: the name hits are found once, not once per medicine the filter keeps.
    parts.push(sql`WITH h AS MATERIALIZED (
        SELECT i.medicine_id, NULL::text AS why, ${score(sql`s.name_fold`)} AS score
          FROM public.cat_substances s JOIN public.cat_medicine_ingredients i ON i.substance_id = s.id
         WHERE s.status = 'active' AND ${nameMatch(sql`s.name_fold`)}
        UNION ALL
        SELECT i.medicine_id, 'Also called ' || n.name, ${score(sql`n.name_fold`)}
          FROM public.cat_substance_names n JOIN public.cat_medicine_ingredients i ON i.substance_id = n.substance_id
         WHERE ${nameMatch(sql`n.name_fold`)}
        UNION ALL
        SELECT mn.medicine_id, 'Also called ' || mn.name, ${score(sql`mn.name_fold`)}
          FROM public.cat_medicine_names mn WHERE mn.name_fold = ${folded}
        ${
          short
            ? prefixOnly
              ? sql`UNION ALL SELECT m2.id, NULL, ${score(sql`m2.name_fold`)} * 0.95
          FROM public.cat_medicines m2 WHERE m2.name_fold LIKE ${prefix}`
              : sql``
            : sql`UNION ALL SELECT m2.id, NULL, ${score(sql`m2.name_fold`)} * 0.95
          FROM public.cat_medicines m2 WHERE m2.name_fold % ${folded}`
        }
      )
      SELECT DISTINCT ON (m.id) 'medicine'::text, m.id, m.id, m.display_name, NULL::text, m.kind, h.why, h.score
        FROM h JOIN public.cat_medicines m ON m.id = h.medicine_id
      WHERE ${medicineFilter(o)}
      ORDER BY m.id, h.score DESC, h.why NULLS FIRST`);
    if (!short || prefixOnly) {
      parts.push(sql`SELECT ${brandOf},
        CASE WHEN p.name_fold IS NOT NULL AND ${nameMatch(sql`p.name_fold`)} THEN NULL ELSE 'Made by ' || f.name END,
        greatest(coalesce(${score(sql`p.name_fold`)}, 0), coalesce(${score(sql`f.name_fold`)}, 0))
        FROM public.cat_products p
        JOIN public.cat_medicines m ON m.id = p.medicine_id
        LEFT JOIN public.cat_manufacturers f ON f.id = p.manufacturer_id
        WHERE p.status = 'active' AND ${medicineFilter(o)}
          AND ((p.name_fold IS NOT NULL AND ${nameMatch(sql`p.name_fold`)})
            OR (f.name_fold IS NOT NULL AND ${nameMatch(sql`f.name_fold`)}))`);
      if (!o.prescribing)
        parts.push(sql`SELECT 'product'::text, p.id, NULL::uuid, p.name, p.strength, NULL::text, NULL::text,
          ${score(sql`private.cat_fold(p.name)`)}
          FROM public.pharmacy_products p
          WHERE p.hospital_id = ${o.hospitalId} AND p.active AND ${nameMatch(sql`private.cat_fold(p.name)`)}`);
    }
  }
  if (!parts.length) return [];

  const rows = rowsOf<Row>(
    await db.execute(sql`
      SELECT grp, id, medicine_id, title, detail, kind, why, score::float8 AS score
        FROM (${sql.join(
          parts.map((x) => sql`(${x})`),
          sql` UNION ALL `,
        )}) u (grp, id, medicine_id, title, detail, kind, why, score)
       ORDER BY CASE grp WHEN 'medicine' THEN 0 WHEN 'brand' THEN 1 ELSE 2 END, score DESC, title
       LIMIT 200`),
  );
  const hits: Omit<CatalogueHit, "form" | "routes">[] = [];
  for (const r of rows)
    if (hits.length < limit && !hits.some((h) => h.group === r.grp && h.id === r.id))
      hits.push({
        group: r.grp,
        id: r.id,
        medicineId: r.medicine_id,
        title: r.title,
        detail: r.detail,
        kind: r.kind,
        why: r.why,
        score: Number(r.score),
      });
  // Form and routes for the hits kept only (the picker's chips), in one statement.
  const ids = [...new Set(hits.map((h) => h.medicineId).filter((x): x is string => !!x))];
  const facts = new Map(
    ids.length
      ? rowsOf<{ id: string; form: string | null; routes: string[] | null }>(
          await db.execute(sql`
            SELECT m.id, f.label AS form,
                   (SELECT array_agg(r.label ORDER BY r.label) FROM public.cat_medicine_routes mr
                      JOIN public.cat_routes r ON r.code = mr.route_code WHERE mr.medicine_id = m.id) AS routes
              FROM public.cat_medicines m LEFT JOIN public.cat_dose_forms f ON f.code = m.dose_form_code
             WHERE m.id IN (${sql.join(
               ids.map((i) => sql`${i}`),
               sql`, `,
             )})`),
        ).map((r) => [r.id, r])
      : [],
  );
  return hits.map((h) => {
    const x = h.medicineId ? facts.get(h.medicineId) : undefined;
    return { ...h, form: x?.form ?? null, routes: x?.routes ?? [] };
  });
}
