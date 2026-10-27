import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";

/**
 * The catalogue team's queue (4.8, at /admin/pharmacy-catalogue): barcode links waiting for a check, conflicts to
 * settle, and the seed and names proposals still open, by source. Read as the owner for curators (the page checks
 * the role); a reviewer never sees their own proposals offered to them.
 */

export interface QueueBarcode {
  proposalId: string;
  code: string;
  codeType: string;
  hospital: string | null;
  medicine: string;
  brand: string | null;
  pack: string;
  state: string | null;
  proposedAt: Date;
  mine: boolean;
}

export interface QueueConflict {
  codeType: string;
  code: string;
  links: {
    packId: string;
    pack: string;
    brand: string | null;
    medicine: string;
    hospital: string | null;
  }[];
}

export interface QueueSource {
  kind: string;
  source: string;
  open: number;
  /** Open proposals this reviewer has not reviewed yet (a batch they can confirm). */
  forYou: number;
}

export async function loadCatalogueQueue(db: EmrDb | EmrTx, reviewer: string) {
  const barcodes = rowsOf<{
    id: string;
    code: string;
    code_type: string;
    hospital: string | null;
    medicine: string;
    brand: string | null;
    pack: string;
    state: string | null;
    created_at: Date;
    mine: boolean;
  }>(
    await db.execute(sql`
      SELECT p.id, p.payload->>'code' AS code, p.payload->>'codeType' AS code_type, h.name AS hospital,
             m.display_name AS medicine, pr.brand_name AS brand, k.description AS pack, p.created_at,
             (SELECT c.state FROM public.cat_pack_codes c WHERE c.hospital_id = p.hospital_id
                 AND c.code = p.payload->>'code' AND c.pack_id = k.id ORDER BY c.created_at DESC LIMIT 1) AS state,
             p.proposed_by = ${reviewer} AS mine
        FROM public.cat_proposals p
        JOIN public.cat_packs k ON k.id = (p.payload->>'packId')::uuid
        JOIN public.cat_products pr ON pr.id = k.product_id
        JOIN public.cat_medicines m ON m.id = pr.medicine_id
        LEFT JOIN public.hospitals h ON h.id = p.hospital_id
       WHERE p.kind = 'new_barcode' AND p.state = 'open'
       ORDER BY p.created_at`),
  );
  const conflictRows = rowsOf<{
    code_type: string;
    code: string;
    pack_id: string;
    pack: string;
    brand: string | null;
    medicine: string;
    hospital: string | null;
  }>(
    await db.execute(sql`
      SELECT c.code_type, c.code, c.pack_id, k.description AS pack, pr.brand_name AS brand,
             m.display_name AS medicine, h.name AS hospital
        FROM public.cat_pack_codes c
        JOIN public.cat_packs k ON k.id = c.pack_id
        JOIN public.cat_products pr ON pr.id = k.product_id
        JOIN public.cat_medicines m ON m.id = pr.medicine_id
        LEFT JOIN public.hospitals h ON h.id = c.hospital_id
       WHERE c.state = 'conflict'
       ORDER BY c.code, c.created_at`),
  );
  const conflicts = new Map<string, QueueConflict>();
  for (const r of conflictRows) {
    const k = `${r.code_type}:${r.code}`;
    const c = conflicts.get(k) ?? { codeType: r.code_type, code: r.code, links: [] };
    c.links.push({
      packId: r.pack_id,
      pack: r.pack,
      brand: r.brand,
      medicine: r.medicine,
      hospital: r.hospital,
    });
    conflicts.set(k, c);
  }
  const sources = rowsOf<{ kind: string; source: string; open: number; for_you: number }>(
    await db.execute(sql`
      SELECT p.kind, coalesce(p.proposer_source, 'hospital') AS source, count(*)::int AS open,
             count(*) FILTER (WHERE p.proposed_by IS DISTINCT FROM ${reviewer} AND NOT EXISTS (
               SELECT 1 FROM public.cat_proposal_reviews r WHERE r.proposal_id = p.id AND r.reviewer = ${reviewer}))::int AS for_you
        FROM public.cat_proposals p
       WHERE p.state = 'open' AND p.kind <> 'new_barcode'
       GROUP BY 1, 2 ORDER BY 1, 2`),
  );
  return {
    barcodes: barcodes.map(
      (b): QueueBarcode => ({
        proposalId: b.id,
        code: b.code,
        codeType: b.code_type,
        hospital: b.hospital,
        medicine: b.medicine,
        brand: b.brand,
        pack: b.pack,
        state: b.state,
        proposedAt: new Date(b.created_at),
        mine: b.mine,
      }),
    ),
    conflicts: [...conflicts.values()],
    sources: sources.map(
      (s): QueueSource => ({ kind: s.kind, source: s.source, open: s.open, forYou: s.for_you }),
    ),
  };
}

/** The next batch (at most 200) of a source's open proposals this reviewer may confirm. */
export async function nextBatch(db: EmrDb | EmrTx, reviewer: string, kind: string, source: string) {
  return rowsOf<{ id: string }>(
    await db.execute(sql`
      SELECT p.id FROM public.cat_proposals p
       WHERE p.state = 'open' AND p.kind = ${kind} AND coalesce(p.proposer_source, 'hospital') = ${source}
         AND p.proposed_by IS DISTINCT FROM ${reviewer}
         AND NOT EXISTS (SELECT 1 FROM public.cat_proposal_reviews r WHERE r.proposal_id = p.id AND r.reviewer = ${reviewer})
       ORDER BY p.created_at LIMIT 200`),
  ).map((r) => r.id);
}
