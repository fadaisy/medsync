import type { ItemType } from "@/content/pharmacy-supplies";

import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type {
  ApprovalAsk,
  DeliveryKind,
  DeliveryPhoto,
  FigureRow,
  LineSource,
  ReceiveClaim,
  ReceiveDelivery,
  ReceiveDispatch,
  ReceiveLine,
  ReceiveMed,
  ReceiveOrder,
  ReceiveRecall,
  ReceiveRules,
  ReceiveWorld,
  RegistrationLine,
  RejWhy,
  SupplierRow,
} from "@/lib/pharmacy/derive/receive";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { sql } from "drizzle-orm";

import { CATALOGUE_DISPATCH_WORDS } from "@/content/pharmacy-receive";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { lineInfo, orderState, receiveRules } from "@/lib/pharmacy/derive/receive";
import { daysAt, needAt } from "@/lib/pharmacy/derive/store/places";
import { lastUnitCosts } from "@/lib/pharmacy/prices/store";
import { ruleNumbers } from "@/lib/pharmacy/rules/registry";
import { productCatalogueFacts, registrationList } from "@/lib/pharmacy/stores/receiving-store";

/**
 * Stock › Receive a delivery: one `ReceiveWorld` per request (RECEIVE §I). Lines stay as typed (`*_text`, packs, per
 * pack) until finishing; older deliveries, finished before 0276, read their stock columns.
 */
type Db = EmrDb | EmrTx;
const KAMPALA = (col: ReturnType<typeof sql>) =>
  sql`to_char(${col} AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD HH24:MI')`;

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const wholeOr = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(n);
};

export async function loadRules(db: Db, h: string): Promise<ReceiveRules> {
  const rows = rowsOf<{
    rule_group: string;
    key: string;
    text: string;
    params: { n?: number } | null;
  }>(
    await db.execute(
      sql`SELECT rule_group, key, text, params FROM public.pharmacy_rules WHERE hospital_id = ${h}::uuid`,
    ),
  );
  return receiveRules(ruleNumbers(rows as never));
}

export async function loadMeds(db: Db, h: string): Promise<ReceiveMed[]> {
  const [rows, costs] = await Promise.all([
    db.execute(sql`
      SELECT p.item_type, p.sterile, p.test_kit, p.no_expiry, p.id, p.name, p.issue_unit AS unit, p.packs, p.pack_size, p.gtin, p.usual_shelf,
             coalesce(p.cold_chain, false) AS cold, private.pharmacy_product_controlled(p.id) AS controlled,
             p.vaccine, p.own_code, p.medicine_id LIKE 'cat_local_%' AS local,
             (SELECT s.shelf FROM public.pharmacy_batches b
                JOIN LATERAL (SELECT x.shelf FROM public.pharmacy_batch_shelves x WHERE x.batch_id = b.id
                               ORDER BY x.created_at DESC LIMIT 1) s ON s.shelf IS NOT NULL
               WHERE b.product_id = p.id LIMIT 1) AS on_shelf,
             (SELECT x.price_ugx FROM public.pharmacy_product_prices x
                JOIN public.pharmacy_payers y ON y.id = x.payer_id AND y.code = 'cash'
               WHERE x.product_id = p.id AND x.from_date <= current_date
               ORDER BY x.from_date DESC, x.created_at DESC LIMIT 1) AS price
        FROM public.pharmacy_products p WHERE p.hospital_id = ${h}::uuid AND p.active ORDER BY p.name`),
    lastUnitCosts(db as never, h),
  ]);
  const facts = await productCatalogueFacts(db as EmrTx, h);
  return rowsOf<{
    id: string;
    name: string;
    unit: string;
    packs: number[] | null;
    pack_size: string | null;
    gtin: string | null;
    usual_shelf: string | null;
    cold: boolean;
    controlled: boolean;
    vaccine: boolean;
    own_code: boolean;
    local: boolean;
    item_type: ItemType;
    sterile: boolean;
    test_kit: boolean;
    no_expiry: boolean;
    on_shelf: string | null;
    price: number | null;
  }>(rows).map((p) => {
    const per =
      facts.get(p.id)?.contents ?? p.packs?.[0] ?? (Number.parseInt(p.pack_size ?? "", 10) || 1);
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      per,
      cost: Math.round((costs.get(p.id) ?? 0) * per),
      price: Number(p.price ?? 0),
      hand: 0,
      shelf: p.usual_shelf ?? p.on_shelf ?? "",
      gtin: p.gtin ?? "",
      cold: p.cold,
      controlled: p.controlled,
      itemType: p.item_type,
      sterile: p.sterile,
      kit: p.test_kit,
      noExpiry: p.no_expiry,
      vaccine: p.vaccine,
      regLapsed: !!facts.get(p.id)?.registration,
      local: p.local,
      ownCode: p.own_code,
      short: null,
    };
  });
}

export async function loadRecalls(db: Db, h: string): Promise<ReceiveRecall[]> {
  return rowsOf<{
    product_id: string;
    batch: string | null;
    notice: string;
    level: string;
    source: string;
  }>(
    await db.execute(sql`SELECT product_id, batch_number AS batch, notice_ref AS notice, level, source
      FROM public.pharmacy_recalls WHERE hospital_id = ${h}::uuid AND closed_at IS NULL`),
  ).map((r) => ({
    medId: r.product_id,
    batch: r.batch ?? "",
    notice: r.notice,
    why: r.level,
    from: r.source.toUpperCase(),
  }));
}

/** Open orders, and any closed ones `alsoIds` names (a finished delivery's line still reads its order). */
export async function loadOrders(
  db: Db,
  h: string,
  storeId: string,
  meds: readonly ReceiveMed[],
  alsoIds: readonly string[] = [],
): Promise<ReceiveOrder[]> {
  const heads = rowsOf<{
    id: string;
    state: string;
    supplier_id: string;
    supplier: string;
    lead_days: number;
    sent_on: string;
    chased_on: string | null;
    edited_on: string | null;
  }>(
    await db.execute(sql`
      SELECT o.id, o.state, o.supplier_id, s.name AS supplier, s.lead_days,
             to_char(o.sent_at AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') AS sent_on,
             o.chased_on::text AS chased_on, o.edited_on::text AS edited_on
        FROM public.pharmacy_orders o JOIN public.pharmacy_suppliers s ON s.id = o.supplier_id
       WHERE o.hospital_id = ${h}::uuid AND o.sent_at IS NOT NULL
         AND (o.state = 'open' OR o.id = ANY(${`{${alsoIds.join(",")}}`}::uuid[]))
       ORDER BY o.sent_at`),
  );
  if (!heads.length) return [];
  const lines = rowsOf<{
    id: string;
    order_id: string;
    product_id: string;
    packs: number | null;
    per_pack: number | null;
    units: number | null;
    price: string | null;
    received: number;
  }>(
    await db.execute(sql`
      SELECT l.id, l.order_id, l.product_id, l.packs, l.per_pack, coalesce(l.chosen_units, l.proposed_units) AS units,
             l.price_per_pack AS price, l.received_packs AS received
        FROM public.pharmacy_order_lines l
       WHERE l.order_id = ANY(${`{${heads.map((x) => x.id).join(",")}}`}::uuid[]) AND l.closed_at IS NULL`),
  );
  const perOf = new Map(meds.map((m) => [m.id, m]));
  return heads.map((o, i) => {
    const own = lines
      .filter((l) => l.order_id === o.id)
      .map((l) => {
        const m = perOf.get(l.product_id);
        const per = l.per_pack ?? m?.per ?? 1;
        return {
          id: l.id,
          medId: l.product_id,
          packs: l.packs ?? Math.ceil((l.units ?? 0) / per),
          received: Number(l.received),
          price: l.price === null ? (m?.cost ?? 0) : Number(l.price),
        };
      });
    return {
      id: o.id,
      ref: `PO-${String(i + 1).padStart(4, "0")}`,
      supplierId: o.supplier_id,
      supplier: o.supplier,
      place: storeId,
      leadDays: o.lead_days,
      sentOn: o.sent_on,
      chasedOn: o.chased_on ?? "",
      editedOn: o.edited_on ?? "",
      state: o.state === "closed" ? "closed" : orderState(own),
      lines: own,
    };
  });
}

interface LineRow {
  id: string;
  delivery_id: string;
  line_no: number;
  product_id: string;
  order_line_id: string | null;
  identity_source: string | null;
  batch_number: string | null;
  expiry_text: string | null;
  expiry: string | null;
  expiry_month_only: boolean;
  counted_packs: number | null;
  pack_contents: number | null;
  note_packs: number | null;
  note_quantity: number | null;
  cost_per_pack: string | null;
  unit_cost: string | null;
  temp_c: string | null;
  short_dated_decision: string | null;
  approver: string | null;
  asked: boolean;
  registration_reason: string | null;
  registration_note: string | null;
  rej_packs: number | null;
  reject_reason: string | null;
  rej_fate: string | null;
  vvm_stage: number | null;
  freeze_check: string | null;
  seal: string | null;
  kit_temp: string | null;
  owed_frozen: number | null;
  witness: string | null;
  accepted_quantity: number;
  rejected_kept_quantity: number;
  rejected_returned_quantity: number;
}

export function lineFromRow(r: LineRow): ReceiveLine {
  const old =
    r.counted_packs === null &&
    r.accepted_quantity + r.rejected_kept_quantity + r.rejected_returned_quantity > 0;
  const rejected = r.rejected_kept_quantity + r.rejected_returned_quantity;
  return {
    id: r.id,
    no: r.line_no,
    medId: r.product_id,
    source: (r.identity_source ?? "typed") as LineSource,
    orderLineId: r.order_line_id,
    batch: text(r.batch_number),
    exp: r.expiry_text ?? (r.expiry ? (r.expiry_month_only ? r.expiry.slice(0, 7) : r.expiry) : ""),
    packs: old ? String(r.accepted_quantity + rejected) : text(r.counted_packs),
    per: old ? "1" : text(r.pack_contents),
    notePacks: old ? text(r.note_quantity) : text(r.note_packs),
    cost: old ? wholeOr(r.unit_cost) : wholeOr(r.cost_per_pack),
    temp: wholeOr(r.temp_c),
    decision: (r.short_dated_decision ?? "") as ReceiveLine["decision"],
    approvedBy: r.approver ?? "",
    approvalAsked: r.asked,
    regReason: (r.registration_reason ?? "") as ReceiveLine["regReason"],
    regNote: text(r.registration_note),
    rejOn: old ? rejected > 0 : r.rej_packs !== null,
    rejPacks: old ? (rejected ? String(rejected) : "") : text(r.rej_packs),
    rejWhy: (r.reject_reason ?? "") as "" | RejWhy,
    rejFate: (r.rej_fate ??
      (r.rejected_kept_quantity ? "quarantine" : "driver")) as ReceiveLine["rejFate"],
    vvm: (r.vvm_stage ? String(r.vvm_stage) : "") as ReceiveLine["vvm"],
    freeze: (r.freeze_check ?? "") as ReceiveLine["freeze"],
    seal: (r.seal ?? "") as ReceiveLine["seal"],
    kitTemp: (r.kit_temp ?? "") as ReceiveLine["kitTemp"],
    rank: 0,
    owedFrozen: r.owed_frozen,
    witnessName: r.witness ?? "",
  };
}

export async function loadLines(db: Db, deliveryIds: readonly string[]) {
  if (!deliveryIds.length) return new Map<string, ReceiveLine[]>();
  const rows = rowsOf<LineRow>(
    await db.execute(sql`
      SELECT l.id, l.delivery_id, l.line_no, l.product_id, l.order_line_id, l.identity_source, l.batch_number, l.expiry_text,
             l.expiry::text AS expiry, l.expiry_month_only, l.counted_packs, l.pack_contents, l.note_packs, l.note_quantity,
             l.cost_per_pack, l.unit_cost, l.temp_c, l.short_dated_decision, coalesce(a.full_name, a.email) AS approver,
             l.approval_asked_at IS NOT NULL AS asked, l.registration_reason, l.registration_note, l.rej_packs,
             l.reject_reason, l.rej_fate, l.vvm_stage, l.freeze_check, l.seal, l.kit_temp, l.owed_frozen, coalesce(w.full_name, w.email) AS witness,
             l.accepted_quantity, l.rejected_kept_quantity, l.rejected_returned_quantity
        FROM public.pharmacy_delivery_lines l
        LEFT JOIN public.users a ON a.id = l.approved_by
        LEFT JOIN public.users w ON w.id = l.witness_id
       WHERE l.delivery_id = ANY(${`{${deliveryIds.join(",")}}`}::uuid[]) ORDER BY l.line_no`),
  );
  const out = new Map<string, ReceiveLine[]>();
  for (const r of rows) out.set(r.delivery_id, [...(out.get(r.delivery_id) ?? []), lineFromRow(r)]);
  return out;
}

interface DeliveryRow {
  id: string;
  kind: DeliveryKind;
  pharmacy_supplier_id: string | null;
  source: string;
  from_text: string | null;
  from_location_id: string | null;
  order_id: string | null;
  note_number: string;
  location_id: string;
  arrived: string;
  deliverer_name: string | null;
  vehicle_registration: string | null;
  blind: boolean;
  invoice_no: string | null;
  invoice_total: string | null;
  state: "counting" | "received" | "abandoned";
  grn: string | null;
  finished: string | null;
  shelved: string | null;
  abandon_reason: string | null;
  checker: string | null;
  claim_ref: string | null;
}
const DELIVERY = sql`
  SELECT d.id, d.kind, d.pharmacy_supplier_id, coalesce(s.name, c.name, d.from_text, f.name, '') AS source, d.from_text,
         d.from_location_id, d.order_id, d.note_number, d.location_id, ${KAMPALA(sql`d.arrived_at`)} AS arrived,
         d.deliverer_name, d.vehicle_registration, d.blind, d.invoice_no, d.invoice_total, d.state, d.grn,
         ${KAMPALA(sql`d.finished_at`)} AS finished, ${KAMPALA(sql`d.shelved_at`)} AS shelved, d.abandon_reason,
         coalesce(k.full_name, k.email) AS checker, cl.ref AS claim_ref
    FROM public.pharmacy_deliveries d
    LEFT JOIN public.pharmacy_suppliers s ON s.id = d.pharmacy_supplier_id
    LEFT JOIN public.pharmacy_counterparties c ON c.id = d.supplier_id
    LEFT JOIN public.pharmacy_locations f ON f.id = d.from_location_id
    LEFT JOIN public.users k ON k.id = d.second_checker_id
    LEFT JOIN public.pharmacy_supplier_claims cl ON cl.delivery_id = d.id`;

const deliveryOf = (r: DeliveryRow, lines: ReceiveLine[]): ReceiveDelivery => ({
  id: r.id,
  kind: r.kind,
  supplierId: r.pharmacy_supplier_id,
  source: r.source,
  from: r.from_text ?? "",
  fromPlace: r.from_location_id,
  orderId: r.order_id,
  note: r.note_number,
  place: r.location_id,
  arrived: r.arrived,
  deliverer: r.deliverer_name ?? "",
  vehicle: r.vehicle_registration ?? "",
  blind: r.blind,
  invoice: r.invoice_no ?? "",
  invoiceTotal: wholeOr(r.invoice_total),
  state: r.state,
  grn: r.grn ?? "",
  finished: r.finished ?? "",
  shelvedAt: r.shelved ?? "",
  abandonReason: r.abandon_reason ?? "",
  secondCheck: r.checker ?? "",
  claimRef: r.claim_ref ?? "",
  lines,
  put: [],
  photos: [],
  conflict: "",
});

/** The place with the fewest days of cover and a need (Main store's rule): where "Send n straight" goes. */
function shortOf(w: StoreWorld, medId: string) {
  let best: { id: string; name: string; days: number; need: number } | null = null;
  for (const p of w.places) {
    const days = daysAt(w, medId, p.id);
    const need = needAt(w, medId, p.id);
    if (days !== null && days < w.rules.transferUnder && need > 0 && (!best || days < best.days))
      best = { id: p.id, name: p.name, days, need };
  }
  return best;
}

export async function loadReceiveWorld(
  db: Db,
  o: {
    hospitalId: string;
    actorUserId: string;
    placeId?: string | null;
    deliveryId?: string | null;
    now?: Date;
    /** The Main store's world, for "Send n straight" (only with batches waiting). */
    store?: () => Promise<StoreWorld | null>;
    signPhotos?: (paths: string[]) => Promise<Map<string, string>>;
  },
): Promise<ReceiveWorld | null> {
  const h = o.hospitalId;
  const q = async <T>(s: ReturnType<typeof sql>) => rowsOf<T>(await db.execute(s));
  const places = await q<{
    id: string;
    name: string;
    kind: string;
    supplied_from: string | null;
  }>(sql`
    SELECT id, name, kind, supplied_from FROM public.pharmacy_locations
     WHERE hospital_id = ${h}::uuid AND archived_at IS NULL AND kind NOT IN ('quarantine','transit','prepared') ORDER BY kind = 'store' DESC, name`);
  const store = places.find((p) => p.kind === "store");
  if (!store) return null;
  const placeId = places.find((p) => p.id === o.placeId)?.id ?? store.id;
  const [me] = await q<{ name: string; in_charge: boolean; today: string; facility: string }>(sql`
    SELECT coalesce(u.full_name, u.email) AS name, private.pharmacy_is_in_charge(u.id, ${h}::uuid) AS in_charge,
           to_char(${o.now?.toISOString() ?? new Date().toISOString()}::timestamptz AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') AS today,
           (SELECT name FROM public.hospitals WHERE id = ${h}::uuid) AS facility
      FROM public.users u WHERE u.id = ${o.actorUserId}::uuid`);
  const [rules, meds, recalls] = await Promise.all([
    loadRules(db, h),
    loadMeds(db, h),
    loadRecalls(db, h),
  ]);

  const handRows = await q<{ product_id: string; n: number }>(sql`
    SELECT b.product_id, sum(m.quantity)::int AS n
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
     WHERE m.hospital_id = ${h}::uuid AND m.location_id = ${placeId}::uuid
     GROUP BY b.product_id`);
  const hand = new Map(handRows.map((r) => [r.product_id, Number(r.n)]));
  for (const m of meds) m.hand = hand.get(m.id) ?? 0;

  const deliveryRows = await q<DeliveryRow>(sql`${DELIVERY}
     WHERE d.hospital_id = ${h}::uuid AND d.location_id = ${placeId}::uuid
       AND (d.state = 'counting' OR d.finished_at >= now() - interval '180 days'
            OR d.id = ${o.deliveryId ?? null}::uuid)
     ORDER BY coalesce(d.finished_at, d.arrived_at) DESC LIMIT 60`);
  const lineMap = await loadLines(
    db,
    deliveryRows.map((d) => d.id),
  );
  const deliveries = deliveryRows.map((d) => deliveryOf(d, lineMap.get(d.id) ?? []));
  const put = await q<{
    delivery_id: string;
    line_id: string;
    batch_id: string;
    shelf: string | null;
    qty: number;
    sent_qty: number;
    done: boolean;
    shelf_row_id: string | null;
    on_shelf: string | null;
  }>(sql`
    SELECT l.delivery_id, p.delivery_line_id AS line_id, p.batch_id, p.shelf, p.qty, p.sent_qty, p.done_at IS NOT NULL AS done, p.shelf_row_id,
           (SELECT x.shelf FROM public.pharmacy_batch_shelves x WHERE x.batch_id = p.batch_id ORDER BY x.created_at DESC LIMIT 1) AS on_shelf
      FROM public.pharmacy_delivery_put_away p JOIN public.pharmacy_delivery_lines l ON l.id = p.delivery_line_id
     WHERE l.delivery_id = ANY(${`{${deliveries.map((d) => d.id).join(",")}}`}::uuid[]) ORDER BY p.created_at`);
  for (const r of put)
    deliveries
      .find((d) => d.id === r.delivery_id)
      ?.put.push({
        lineId: r.line_id,
        batchId: r.batch_id,
        shelf: r.shelf ?? "",
        qty: r.qty,
        sent: r.sent_qty,
        done: r.done,
        shelfRowId: r.shelf_row_id,
        alreadyOn: r.on_shelf,
      });
  if (o.deliveryId && deliveries.some((d) => d.id === o.deliveryId)) {
    const photos = await q<{ id: string; kind: DeliveryPhoto["kind"]; file: string }>(sql`
      SELECT id, kind, file FROM public.pharmacy_delivery_photos WHERE delivery_id = ${o.deliveryId}::uuid ORDER BY created_at`);
    const urls = (await o.signPhotos?.(photos.map((p) => p.file))) ?? new Map<string, string>();
    deliveries.find((d) => d.id === o.deliveryId)!.photos = photos.map((p) => ({
      id: p.id,
      kind: p.kind,
      url: urls.get(p.file) ?? "",
    }));
  }

  const orders = await loadOrders(
    db,
    h,
    store.id,
    meds,
    deliveries.flatMap((d) => (d.orderId ? [d.orderId] : [])),
  );

  // "Send n straight": only when something waits for a shelf, since it reads the Main store's whole world.
  const waiting = new Set(
    deliveries.flatMap((d) =>
      d.put.filter((p) => !p.done).map((p) => d.lines.find((l) => l.id === p.lineId)?.medId),
    ),
  );
  if (waiting.size && o.store) {
    const sw = await o.store();
    if (sw)
      for (const m of meds) {
        if (!waiting.has(m.id)) continue;
        const s = shortOf(sw, m.id);
        if (s) m.short = { place: s.id, placeName: s.name, n: s.need };
      }
  }

  const claimRows = await q<{
    id: string;
    ref: string;
    delivery_id: string;
    note_number: string;
    grn: string | null;
    supplier_id: string;
    supplier: string;
    state: ReceiveClaim["state"];
    made: string;
    total: string;
    credit_note: string | null;
  }>(sql`
    SELECT c.id, c.ref, c.delivery_id, d.note_number, d.grn, c.pharmacy_supplier_id AS supplier_id, s.name AS supplier, c.state,
           ${KAMPALA(sql`c.created_at`)} AS made, c.total, c.credit_note
      FROM public.pharmacy_supplier_claims c JOIN public.pharmacy_deliveries d ON d.id = c.delivery_id
      JOIN public.pharmacy_suppliers s ON s.id = c.pharmacy_supplier_id
     WHERE c.hospital_id = ${h}::uuid AND (c.state <> 'credit' OR c.credited_at >= now() - interval '90 days')
     ORDER BY c.created_at DESC`);
  const claimLineRows = claimRows.length
    ? await q<{
        claim_id: string;
        product_id: string;
        kind: string;
        packs: number;
        value: string;
      }>(sql`
        SELECT claim_id, product_id, kind, packs, value FROM public.pharmacy_claim_lines
         WHERE claim_id = ANY(${`{${claimRows.map((c) => c.id).join(",")}}`}::uuid[])`)
    : [];
  const claims: ReceiveClaim[] = claimRows.map((c) => ({
    id: c.id,
    ref: c.ref,
    note: c.note_number,
    grn: c.grn ?? "",
    deliveryId: c.delivery_id,
    supplierId: c.supplier_id,
    supplier: c.supplier,
    state: c.state,
    made: c.made,
    total: Number(c.total),
    creditNote: c.credit_note ?? "",
    lines: claimLineRows
      .filter((l) => l.claim_id === c.id)
      .map((l) => ({ medId: l.product_id, kind: l.kind, packs: l.packs, value: Number(l.value) })),
  }));

  const issues = await q<{
    id: string;
    voucher: string;
    kind: string;
    sent: string;
    confirmed: boolean;
    note: string | null;
  }>(sql`
    SELECT i.id, i.voucher, i.dispatch_kind AS kind, ${KAMPALA(sql`i.issued_at`)} AS sent, c.id IS NOT NULL AS confirmed, c.note
      FROM public.pharmacy_issues i LEFT JOIN public.pharmacy_issue_confirmations c ON c.issue_id = i.id
     WHERE i.hospital_id = ${h}::uuid AND i.to_location_id = ${placeId}::uuid AND i.voucher IS NOT NULL
       AND (c.id IS NULL OR c.confirmed_at >= now() - interval '30 days') ORDER BY i.issued_at DESC`);
  const legs = issues.length
    ? await q<{ issue_id: string; name: string; batch: string; qty: number; unit: string }>(sql`
        SELECT m.source_id AS issue_id, p.name, b.batch_number AS batch, (-sum(m.quantity))::int AS qty, p.issue_unit AS unit
          FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
          JOIN public.pharmacy_products p ON p.id = b.product_id
         WHERE m.source_id = ANY(${`{${issues.map((i) => i.id).join(",")}}`}::uuid[]) AND m.kind IN ('issued','returned_out')
         GROUP BY 1, 2, 3, 5`)
    : [];
  const dispatches: ReceiveDispatch[] = issues.map((i) => ({
    id: i.id,
    voucher: i.voucher,
    kindText: (CATALOGUE_DISPATCH_WORDS as Record<string, string>)[i.kind] ?? i.kind,
    sentAt: i.sent,
    state: !i.confirmed ? "transit" : i.note ? "diff" : "received",
    note: i.note ?? "",
    lines: legs
      .filter((l) => l.issue_id === i.id)
      .map((l) => ({ name: l.name, batch: l.batch, qty: l.qty })),
  }));

  const asks: ApprovalAsk[] = me?.in_charge
    ? await q<{
        delivery_id: string;
        id: string;
        note: string;
        med: string;
        batch: string;
        exp: string;
        asked_by: string;
      }>(sql`
        SELECT d.id AS delivery_id, l.id, d.note_number AS note, p.name AS med, coalesce(l.batch_number, '') AS batch,
               coalesce(l.expiry_text, '') AS exp, coalesce(u.full_name, u.email) AS asked_by
          FROM public.pharmacy_delivery_lines l JOIN public.pharmacy_deliveries d ON d.id = l.delivery_id
          JOIN public.pharmacy_products p ON p.id = l.product_id JOIN public.users u ON u.id = d.counted_by
         WHERE d.hospital_id = ${h}::uuid AND d.state = 'counting' AND l.approval_asked_at IS NOT NULL AND l.approved_by IS NULL
         ORDER BY l.approval_asked_at`).then((r) =>
        r.map((a) => ({
          deliveryId: a.delivery_id,
          lineId: a.id,
          note: a.note,
          med: a.med,
          batch: a.batch,
          exp: a.exp,
          askedBy: a.asked_by,
        })),
      )
    : [];

  const lineWorld = { meds, orders, recalls: [], rules, today: me?.today ?? "" };
  const figureRows: FigureRow[] = deliveries
    .filter((d) => d.state === "received" && d.kind === "supplier" && d.finished)
    .sort((a, b) => a.finished.localeCompare(b.finished))
    .map((d) => {
      const counted = d.lines.filter((l) => Number(l.packs) > 0);
      return {
        note: d.note,
        supplierId: d.supplierId,
        arrived: d.arrived,
        finished: d.finished,
        shelvedAt: d.shelvedAt,
        lines: counted.length,
        matched: counted.filter((l) => !lineInfo(l, d, lineWorld).words.some((x) => x.caution))
          .length,
      };
    })
    .slice(-8);
  const supplierRows = await q<{
    supplier_id: string;
    order_id: string;
    sent_on: string;
    packs: number;
    received: number;
    first_at: string | null;
    lead_days: number;
  }>(sql`
    SELECT o.supplier_id, o.id AS order_id, to_char(o.sent_at AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') AS sent_on,
           coalesce(l.packs, 0) AS packs, l.received_packs AS received,
           (SELECT to_char(min(d.arrived_at) AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') FROM public.pharmacy_deliveries d
             WHERE d.order_id = o.id AND d.state = 'received') AS first_at, s.lead_days
      FROM public.pharmacy_orders o JOIN public.pharmacy_order_lines l ON l.order_id = o.id
      JOIN public.pharmacy_suppliers s ON s.id = o.supplier_id
     WHERE o.hospital_id = ${h}::uuid AND o.sent_at >= now() - interval '6 months' AND l.packs IS NOT NULL`);
  const differences = await q<{ supplier_id: string; n: number }>(sql`
    SELECT d.pharmacy_supplier_id AS supplier_id, count(*)::int AS n
      FROM public.pharmacy_delivery_lines l JOIN public.pharmacy_deliveries d ON d.id = l.delivery_id
     WHERE d.hospital_id = ${h}::uuid AND d.state = 'received' AND d.finished_at >= now() - interval '6 months'
       AND d.pharmacy_supplier_id IS NOT NULL
       AND ((l.note_packs IS NOT NULL AND l.note_packs <> l.counted_packs) OR coalesce(l.rej_packs, 0) > 0)
     GROUP BY 1`);
  const supplierList = await q<{ id: string; name: string; lead_days: number }>(sql`
    SELECT id, name, lead_days FROM public.pharmacy_suppliers WHERE hospital_id = ${h}::uuid ORDER BY name`);

  const registration: RegistrationLine[] = me?.in_charge
    ? (await registrationList(db as EmrTx, h)).map((r) => ({
        note: r.note_number,
        med: r.product,
        batch: "",
        reason: r.note ?? r.reason,
      }))
    : [];

  return {
    hospitalId: h,
    facility: me?.facility ?? "",
    me: { id: o.actorUserId, name: me?.name ?? "", inCharge: !!me?.in_charge },
    placeId,
    places: places.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      direct:
        p.kind === "store" || (!p.supplied_from && ["dispensing_point", "clinic"].includes(p.kind)),
    })),
    meds,
    suppliers: supplierList.map((s) => ({ id: s.id, name: s.name, leadDays: s.lead_days })),
    orders,
    deliveries,
    claims,
    recalls,
    dispatches,
    asks,
    figureRows,
    supplierRows: supplierRows.map((r) => ({
      supplierId: r.supplier_id,
      orderId: r.order_id,
      sentOn: r.sent_on,
      packs: Number(r.packs),
      received: Number(r.received),
      firstAt: r.first_at ?? "",
      leadDays: r.lead_days,
    })) satisfies SupplierRow[],
    differencesBy: differences.map((d) => [d.supplier_id, d.n] as [string, number]),
    registration,
    rules,
    today: me?.today ?? "",
  };
}
