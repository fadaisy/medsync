import "server-only";

import type { CorrectionPayload } from "./correction";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";

/**
 * The catalogue team's queue (4.8, at /admin/pharmacy-catalogue): barcode links waiting for a check, conflicts to
 * settle, corrections to a medicine (each on its own), and the seed and names proposals still open, by source. Read as the owner for curators (the page checks
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

/** A correction waiting for its two curators (owner item 10): each is reviewed on its own, never in a batch. */
export interface QueueCorrection {
  proposalId: string;
  medicine: string;
  payload: CorrectionPayload;
  proposer: string | null;
  hospital: string | null;
  proposedAt: Date;
  confirmations: number;
  mine: boolean;
  /** This reviewer has already confirmed it. */
  reviewed: boolean;
}

/** The signed forms and routes, code → label (small lists, read whole). */
export async function vocabularies(db: EmrDb | EmrTx) {
  const rows = rowsOf<{ list: "form" | "route"; code: string; label: string; status: string }>(
    await db.execute(sql`
      SELECT 'form' AS list, code, label, status FROM public.cat_dose_forms
      UNION ALL SELECT 'route', code, label, status FROM public.cat_routes
      ORDER BY 1, 3`),
  );
  const pick = (list: "form" | "route") => rows.filter((r) => r.list === list);
  return {
    forms: new Map(pick("form").map((r) => [r.code, r.label])),
    routes: new Map(pick("route").map((r) => [r.code, r.label])),
    signedForms: pick("form").filter((r) => r.status === "signed"),
    signedRoutes: pick("route").filter((r) => r.status === "signed"),
  };
}

/** One medicine's form and route codes and its open correction, for the Set-up page's Edit (owner item 10). */
export async function correctionContext(db: EmrDb | EmrTx, medicineId: string) {
  const [m] = rowsOf<{ form_code: string | null; routes: string[] | null }>(
    await db.execute(sql`
      SELECT m.dose_form_code AS form_code,
             (SELECT array_agg(r.route_code ORDER BY r.route_code) FROM public.cat_medicine_routes r
               WHERE r.medicine_id = m.id) AS routes
        FROM public.cat_medicines m WHERE m.id = ${medicineId}`),
  );
  const [open] = rowsOf<{ payload: CorrectionPayload }>(
    await db.execute(sql`
      SELECT p.payload FROM public.cat_proposals p
       WHERE p.kind = 'correction' AND p.state = 'open' AND p.payload->>'medicineId' = ${medicineId}
       ORDER BY p.created_at DESC LIMIT 1`),
  );
  return {
    formCode: m?.form_code ?? null,
    routes: m?.routes ?? [],
    pending: open?.payload ?? null,
  };
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
       WHERE p.state = 'open' AND p.kind NOT IN ('new_barcode', 'correction')
       GROUP BY 1, 2 ORDER BY 1, 2`),
  );
  const corrections = rowsOf<{
    id: string;
    medicine: string;
    payload: CorrectionPayload;
    proposer: string | null;
    hospital: string | null;
    created_at: Date;
    confirmations: number;
    mine: boolean;
    reviewed: boolean;
  }>(
    await db.execute(sql`
      SELECT p.id, m.display_name AS medicine, p.payload, u.full_name AS proposer, h.name AS hospital, p.created_at,
             (SELECT count(*)::int FROM public.cat_proposal_reviews r
               WHERE r.proposal_id = p.id AND r.decision = 'confirm') AS confirmations,
             p.proposed_by = ${reviewer} AS mine,
             EXISTS (SELECT 1 FROM public.cat_proposal_reviews r
               WHERE r.proposal_id = p.id AND r.reviewer = ${reviewer}) AS reviewed
        FROM public.cat_proposals p
        JOIN public.cat_medicines m ON m.id = (p.payload->>'medicineId')::uuid
        LEFT JOIN public.users u ON u.id = p.proposed_by
        LEFT JOIN public.hospitals h ON h.id = p.hospital_id
       WHERE p.kind = 'correction' AND p.state = 'open'
       ORDER BY p.created_at`),
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
    corrections: corrections.map(
      (c): QueueCorrection => ({
        proposalId: c.id,
        medicine: c.medicine,
        payload: c.payload,
        proposer: c.proposer,
        hospital: c.hospital,
        proposedAt: new Date(c.created_at),
        confirmations: c.confirmations,
        mine: c.mine,
        reviewed: c.reviewed,
      }),
    ),
    sources: sources.map(
      (s): QueueSource => ({ kind: s.kind, source: s.source, open: s.open, forYou: s.for_you }),
    ),
  };
}

/** The next batch (at most 200) of a source's open proposals this reviewer may confirm. Never a correction: each
 *  of those is reviewed on its own (owner item 10). */
export async function nextBatch(db: EmrDb | EmrTx, reviewer: string, kind: string, source: string) {
  return rowsOf<{ id: string }>(
    await db.execute(sql`
      SELECT p.id FROM public.cat_proposals p
       WHERE p.state = 'open' AND p.kind = ${kind} AND p.kind <> 'correction' AND coalesce(p.proposer_source, 'hospital') = ${source}
         AND p.proposed_by IS DISTINCT FROM ${reviewer}
         AND NOT EXISTS (SELECT 1 FROM public.cat_proposal_reviews r WHERE r.proposal_id = p.id AND r.reviewer = ${reviewer})
       ORDER BY p.created_at LIMIT 200`),
  ).map((r) => r.id);
}
