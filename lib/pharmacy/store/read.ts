import type { ItemType } from "@/content/pharmacy-supplies";
import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type {
  Dispatch,
  DispatchKind,
  PlaceStock,
  ReqState,
  StoreMed,
  StoreWorld,
  Ven,
} from "@/lib/pharmacy/derive/store/types";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/pharmacy/audit/read";
import { outOfRange } from "@/lib/pharmacy/derive/setup/places";
import { addDays, kampala } from "@/lib/pharmacy/derive/store/format";
import { storeRules } from "@/lib/pharmacy/derive/store/types";
import { lastUnitCosts } from "@/lib/pharmacy/prices/store";
import { ruleNumbers } from "@/lib/pharmacy/rules/registry";

/**
 * Stock › Main store: one `StoreWorld` per request (STORE.md §G, §H). The ledger is the truth; nothing here is a stored
 * total. Windows: dispatches and requisitions 84 days plus everything open, losses 12 months, the store's ledger by day
 * 90 days, the places' by day this month, room readings a month.
 */
type Db = EmrDb | EmrTx;
const STATE: Record<string, ReqState> = {
  raised: "open",
  part_issued: "partial",
  issued: "issued",
  confirmed: "received",
  confirmed_with_difference: "diff",
};
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

/** The Monday of the week holding `day`. */
const mondayOf = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
};

export async function loadStoreWorld(
  db: Db,
  o: {
    hospitalId: string;
    actorUserId: string;
    now?: Date;
    medId?: string | null;
    /** The stock-card section is open: with no `medId`, the first medicine's card. */
    cardOpen?: boolean;
  },
): Promise<StoreWorld | null> {
  const h = o.hospitalId;
  const now = o.now ?? new Date();
  const today = kampala(now.toISOString()).slice(0, 10);
  const q = async <T>(s: ReturnType<typeof sql>) => rowsOf<T>(await db.execute(s));

  const [ready] = await q<{ ok: boolean }>(
    sql`SELECT to_regclass('public.pharmacy_shelf_counts') IS NOT NULL AS ok`,
  );
  if (!ready?.ok) return null;
  const [store] = await q<{ id: string; name: string }>(
    sql`SELECT id, name FROM public.pharmacy_locations WHERE hospital_id = ${h}::uuid AND kind = 'store'
         AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  if (!store) return null;
  const S = store.id;
  const since84 = addDays(today, -84);
  const since90 = addDays(today, -90);
  const monthStart = `${today.slice(0, 7)}-01`;

  const rules = storeRules(
    ruleNumbers(
      await q<{ rule_group: string; key: string; text: string; params: { n?: number } | null }>(
        sql`SELECT rule_group, key, text, params FROM public.pharmacy_rules WHERE hospital_id = ${h}::uuid`,
      ),
    ),
  );
  const costs = await lastUnitCosts(db, h);
  const costOf = (productId: string) => costs.get(productId) ?? 0;

  const [me] = await q<{ name: string; in_charge: boolean }>(sql`
    SELECT coalesce(u.full_name, u.email) AS name, private.pharmacy_is_in_charge(u.id, ${h}::uuid) AS in_charge
      FROM public.users u WHERE u.id = ${o.actorUserId}::uuid`);

  /* ─── The store's batches ─── */
  const batchRows = await q<{
    id: string;
    product_id: string;
    no: string;
    exp: string;
    qty: number;
    bin: string | null;
    waiting: boolean;
    blocked: boolean;
    grn: string | null;
    received_at: string | null;
  }>(sql`
    SELECT b.id, b.product_id, b.batch_number AS no, b.expiry::text AS exp, q.qty,
           (SELECT s.shelf FROM public.pharmacy_batch_shelves s WHERE s.batch_id = b.id
             ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS bin,
           private.pharmacy_batch_waiting(b.id) AS waiting,
           (private.pharmacy_expires_on(b.expiry, b.expiry_month_only) < ${today}::date OR private.pharmacy_batch_recalled(b.id)) AS blocked,
           (SELECT d.note_number FROM public.pharmacy_stock_movements m JOIN public.pharmacy_deliveries d ON d.id = m.source_id
             WHERE m.batch_id = b.id AND m.kind = 'received' ORDER BY m.effective_at DESC LIMIT 1) AS grn,
           (SELECT max(m.effective_at) FROM public.pharmacy_stock_movements m WHERE m.batch_id = b.id AND m.kind = 'received') AS received_at
      FROM public.pharmacy_batches b
      JOIN LATERAL (SELECT sum(m.quantity)::int AS qty FROM public.pharmacy_stock_movements m WHERE m.batch_id = b.id) q ON q.qty > 0
     WHERE b.location_id = ${S}::uuid
     ORDER BY b.expiry, b.batch_number`);

  /* ─── The store's ledger by day: use, days out, last moved ─── */
  const dayRows = await q<{ product_id: string; day: string; delta: number; issued: number }>(sql`
    SELECT b.product_id, (m.effective_at AT TIME ZONE 'Africa/Kampala')::date::text AS day, sum(m.quantity)::int AS delta,
           coalesce(-sum(m.quantity) FILTER (WHERE m.kind = 'issued'), 0)::int AS issued
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
     WHERE m.location_id = ${S}::uuid AND m.effective_at >= ${since90}::date
     GROUP BY 1, 2`);
  const movedRows = await q<{ product_id: string; last: string }>(sql`
    SELECT b.product_id, max(m.effective_at AT TIME ZONE 'Africa/Kampala')::date::text AS last
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
     WHERE m.location_id = ${S}::uuid AND m.kind IN ('issued','received','returned_in')
     GROUP BY 1`);
  const movedOf = new Map(movedRows.map((r) => [r.product_id, r.last]));

  const orderRows = await q<{
    id: string;
    supplier_id: string | null;
    supplier: string | null;
    state: "draft" | "open" | "closed";
    budget: string | null;
    sent_at: string | null;
    created_at: string;
    closed_at: string | null;
  }>(sql`
    SELECT o.id, o.supplier_id, s.name AS supplier, o.state, o.budget, o.sent_at, o.created_at, o.closed_at
      FROM public.pharmacy_orders o LEFT JOIN public.pharmacy_suppliers s ON s.id = o.supplier_id
     WHERE o.hospital_id = ${h}::uuid ORDER BY o.created_at DESC LIMIT 40`);
  const orderLines = await q<{
    order_id: string;
    product_id: string;
    qty: number;
    cut: unknown;
    received: number;
    closed: boolean;
  }>(sql`
    SELECT l.order_id, l.product_id, coalesce(l.chosen_units, l.proposed_units, 0)::int AS qty, l.cut, l.closed_at IS NOT NULL AS closed,
           coalesce((SELECT sum(m.quantity) FROM public.pharmacy_deliveries d
              JOIN public.pharmacy_stock_movements m ON m.source_id = d.id AND m.kind = 'received'
              JOIN public.pharmacy_batches b ON b.id = m.batch_id AND b.product_id = l.product_id
             WHERE d.order_id = l.order_id), 0)::int AS received
      FROM public.pharmacy_order_lines l JOIN public.pharmacy_orders o ON o.id = l.order_id
     WHERE o.hospital_id = ${h}::uuid`);
  const onOrderOf = new Map<string, number>();
  const openIds = new Set(orderRows.filter((x) => x.state === "open").map((x) => x.id));
  for (const l of orderLines)
    if (openIds.has(l.order_id) && !l.closed)
      onOrderOf.set(
        l.product_id,
        (onOrderOf.get(l.product_id) ?? 0) + Math.max(0, Number(l.qty) - Number(l.received)),
      );

  /* ─── Medicines: whatever the store or a place has a line for ─── */
  const productRows = await q<{
    id: string;
    medicine_id: string;
    name: string;
    strength: string | null;
    unit: string;
    ven: Ven | null;
    packs: number[] | null;
    pack_size: string | null;
    cold: boolean;
    controlled: boolean;
    item_type: ItemType;
    sterile: boolean;
    test_kit: boolean;
    no_expiry: boolean;
  }>(sql`
    SELECT p.item_type, p.sterile, p.test_kit, p.no_expiry, p.id, p.medicine_id, p.name, p.strength, p.issue_unit AS unit, p.ven, p.packs, p.pack_size, coalesce(p.cold_chain, false) AS cold,
           p.controlled_class IS NOT NULL AS controlled
      FROM public.pharmacy_products p
     WHERE p.hospital_id = ${h}::uuid AND p.active
       AND EXISTS (SELECT 1 FROM public.pharmacy_batches b WHERE b.product_id = p.id AND b.location_id = ${S}::uuid)
     ORDER BY p.name`);
  const deltaBy = new Map<string, Map<string, { delta: number; issued: number }>>();
  for (const r of dayRows) {
    const m = deltaBy.get(r.product_id) ?? new Map();
    m.set(r.day, { delta: Number(r.delta), issued: Number(r.issued) });
    deltaBy.set(r.product_id, m);
  }
  const handNow = new Map<string, number>();
  for (const b of batchRows)
    handNow.set(b.product_id, (handNow.get(b.product_id) ?? 0) + Number(b.qty));
  const binOf = new Map<string, string>();
  for (const b of batchRows) if (b.bin && !binOf.has(b.product_id)) binOf.set(b.product_id, b.bin);
  const meds: StoreMed[] = productRows.map((p) => {
    const d = deltaBy.get(p.id);
    let issued = 0;
    let out = 0;
    let bal = handNow.get(p.id) ?? 0;
    for (let i = 0; i < 90; i++) {
      const day = addDays(today, -i);
      const x = d?.get(day);
      if (bal <= 0) out++;
      issued += x?.issued ?? 0;
      bal -= x?.delta ?? 0;
    }
    const last = movedOf.get(p.id);
    return {
      id: p.id,
      medicineId: p.medicine_id,
      name: p.strength ? `${p.name} ${p.strength}` : p.name,
      short: p.name,
      unit: p.unit,
      ven: p.ven,
      pack: p.packs?.[0] ?? Math.max(1, Number.parseInt(p.pack_size ?? "1", 10) || 1),
      cold: p.cold,
      controlled: p.controlled,
      itemType: p.item_type,
      sterile: p.sterile,
      kit: p.test_kit,
      noExpiry: p.no_expiry,
      cost: costOf(p.id),
      // Last 3 months, adjusted for days out of stock (Rules › Ordering).
      use: Math.round((issued / Math.max(1, 90 - out)) * 30),
      moved: last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null,
      onOrder: onOrderOf.get(p.id) ?? 0,
      bin: binOf.get(p.id) ?? null,
    };
  });
  const known = new Set(meds.map((m) => m.id));

  /* ─── Places ─── */
  const places = await q<{ id: string; name: string; kind: string }>(sql`
    SELECT id, name, kind FROM public.pharmacy_locations
     WHERE hospital_id = ${h}::uuid AND archived_at IS NULL AND closed_at IS NULL AND kind NOT IN ('store','quarantine','transit','cart','prepared')
     ORDER BY name`);
  const placeIds = new Set(places.map((p) => p.id));
  const placeRows = await q<{
    product_id: string;
    place_id: string;
    here: number;
    used: number;
  }>(sql`
    SELECT b.product_id, coalesce(m.location_id, m.dispensing_point_id) AS place_id, sum(m.quantity)::int AS here,
           coalesce(-sum(m.quantity) FILTER (WHERE m.kind IN ('supplied','ward_used','cart_used') AND m.effective_at >= ${since90}::date), 0)::int AS used
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
     WHERE m.hospital_id = ${h}::uuid GROUP BY 1, 2`);
  const levelRows = await q<{ product_id: string; place_id: string; level: number }>(sql`
    SELECT DISTINCT ON (p.id, coalesce(r.location_id, r.dispensing_point_id))
           p.id AS product_id, coalesce(r.location_id, r.dispensing_point_id) AS place_id, r.level
      FROM public.pharmacy_reorder_levels r
      JOIN public.pharmacy_products p ON p.hospital_id = r.hospital_id AND p.active
       AND (r.product_id = p.id OR (r.product_id IS NULL AND r.medicine_id = p.medicine_id))
     WHERE r.hospital_id = ${h}::uuid
     ORDER BY p.id, coalesce(r.location_id, r.dispensing_point_id), r.set_at DESC`);
  const stockKey = (m: string, p: string) => `${m}|${p}`;
  const stock = new Map<string, PlaceStock>();
  for (const r of placeRows) {
    if (!placeIds.has(r.place_id) || !known.has(r.product_id)) continue;
    stock.set(stockKey(r.product_id, r.place_id), {
      medId: r.product_id,
      placeId: r.place_id,
      here: Number(r.here),
      use: Math.round(Number(r.used) / 3),
      level: 0,
    });
  }
  for (const r of levelRows) {
    if (!placeIds.has(r.place_id) || !known.has(r.product_id)) continue;
    const k = stockKey(r.product_id, r.place_id);
    const row = stock.get(k) ?? {
      medId: r.product_id,
      placeId: r.place_id,
      here: 0,
      use: 0,
      level: 0,
    };
    row.level = Number(r.level);
    stock.set(k, row);
  }

  /* ─── Dispatches ─── */
  const issueRows = await q<{
    id: string;
    voucher: string;
    kind: DispatchKind;
    from_id: string;
    to_id: string;
    sent_at: string;
    requisition_id: string | null;
    confirmed_at: string | null;
    note: string | null;
  }>(sql`
    SELECT i.id, i.voucher, i.dispatch_kind AS kind, i.from_location_id AS from_id, i.to_location_id AS to_id, i.issued_at AS sent_at,
           i.requisition_id, c.confirmed_at, c.note
      FROM public.pharmacy_issues i LEFT JOIN public.pharmacy_issue_confirmations c ON c.issue_id = i.id
     WHERE i.hospital_id = ${h}::uuid AND i.voucher IS NOT NULL AND (i.issued_at >= ${since84}::date OR c.id IS NULL)
     ORDER BY i.issued_at DESC`);
  const legRows = await q<{ issue_id: string; product_id: string; no: string; qty: number }>(sql`
    SELECT m.source_id AS issue_id, b.product_id, b.batch_number AS no, (-sum(m.quantity))::int AS qty
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
      JOIN public.pharmacy_issues i ON i.id = m.source_id
     WHERE i.hospital_id = ${h}::uuid AND i.voucher IS NOT NULL AND m.location_id = i.from_location_id
       AND m.kind IN ('issued','returned_out') AND (i.issued_at >= ${since84}::date
        OR NOT EXISTS (SELECT 1 FROM public.pharmacy_issue_confirmations c WHERE c.issue_id = i.id))
     GROUP BY 1, 2, 3`);
  const legsOf = new Map<string, { medId: string; no: string; qty: number }[]>();
  for (const l of legRows)
    legsOf.set(l.issue_id, [
      ...(legsOf.get(l.issue_id) ?? []),
      { medId: l.product_id, no: l.no, qty: Number(l.qty) },
    ]);
  const dispatches: Dispatch[] = issueRows.map((d) => ({
    id: d.id,
    voucher: d.voucher,
    kind: d.kind,
    fromId: d.from_id,
    toId: d.to_id,
    sentAt: iso(d.sent_at)!,
    status: !d.confirmed_at ? "transit" : d.note ? "diff" : "received",
    note: d.note,
    receivedAt: iso(d.confirmed_at),
    requisitionId: d.requisition_id,
    lines: legsOf.get(d.id) ?? [],
  }));

  /* ─── Requisitions ─── */
  const reqRows = await q<{
    id: string;
    place_id: string;
    asked_at: string;
    urgent: boolean;
    reason: string | null;
    state: string;
  }>(sql`
    SELECT id, requesting_location_id AS place_id, raised_at AS asked_at, urgent, reason, state
      FROM public.pharmacy_requisitions
     WHERE hospital_id = ${h}::uuid AND issuing_location_id = ${S}::uuid
       AND state IN ('raised','part_issued','issued','confirmed','confirmed_with_difference')
       AND (raised_at >= ${since84}::date OR state IN ('raised','part_issued','issued'))`);
  const reqLines = await q<{ requisition_id: string; product_id: string; asked: number }>(sql`
    SELECT l.requisition_id, l.product_id, l.quantity_asked AS asked
      FROM public.pharmacy_requisition_lines l JOIN public.pharmacy_requisitions r ON r.id = l.requisition_id
     WHERE r.hospital_id = ${h}::uuid AND r.issuing_location_id = ${S}::uuid
       AND (r.raised_at >= ${since84}::date OR r.state IN ('raised','part_issued','issued'))`);
  const requisitions = reqRows.map((r) => {
    const vouchers = dispatches
      .filter((d) => d.requisitionId === r.id)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    return {
      id: r.id,
      placeId: r.place_id,
      askedAt: iso(r.asked_at)!,
      urgent: r.urgent,
      reason: r.reason,
      state: STATE[r.state]!,
      firstIssuedAt: vouchers[0]?.sentAt ?? null,
      voucher: vouchers.at(-1)?.voucher ?? null,
      diffNote: vouchers.find((d) => d.note)?.note ?? null,
      receivedAt: vouchers.every((d) => d.receivedAt)
        ? (vouchers.at(-1)?.receivedAt ?? null)
        : null,
      lines: reqLines
        .filter((l) => l.requisition_id === r.id)
        .map((l) => ({
          medId: l.product_id,
          asked: Number(l.asked),
          issued: vouchers
            .flatMap((d) => d.lines)
            .filter((x) => x.medId === l.product_id)
            .reduce((a, x) => a + x.qty, 0),
        })),
    };
  });

  /* ─── Runs, returns ─── */
  const runRows = await q<{
    id: string;
    place_id: string;
    weekdays: number[];
    at: string;
    voucher: string | null;
  }>(sql`
    SELECT r.id, r.location_id AS place_id, r.weekdays, to_char(r.at, 'HH24:MI') AS at,
           (SELECT i.voucher FROM public.pharmacy_topup_run_log g JOIN public.pharmacy_issues i ON i.id = g.issue_id
             WHERE g.run_id = r.id AND g.on_date = ${today}::date) AS voucher
      FROM public.pharmacy_topup_runs r WHERE r.hospital_id = ${h}::uuid AND r.ended_at IS NULL`);
  const returnRows = await q<{
    id: string;
    place_id: string;
    product_id: string;
    no: string;
    exp: string;
    qty: number;
    reason: string;
    voucher: string | null;
  }>(sql`
    SELECT r.id, r.location_id AS place_id, b.product_id, b.batch_number AS no, b.expiry::text AS exp, r.qty, r.reason, i.voucher
      FROM public.pharmacy_store_returns r JOIN public.pharmacy_batches b ON b.id = r.batch_id
      LEFT JOIN public.pharmacy_issues i ON i.id = r.accepted_issue_id
     WHERE r.hospital_id = ${h}::uuid AND (r.accepted_at IS NULL OR r.accepted_at >= ${addDays(today, -14)}::date)
     ORDER BY r.proposed_at DESC`);

  /* ─── Suppliers ─── */
  const supplierRows = await q<{ id: string; name: string; promised: number | null }>(sql`
    SELECT id, name, lead_days AS promised FROM public.pharmacy_suppliers WHERE hospital_id = ${h}::uuid ORDER BY name`);
  const claimRows = await q<{ supplier_id: string; n: number }>(sql`
    SELECT pharmacy_supplier_id AS supplier_id, count(*)::int AS n FROM public.pharmacy_supplier_claims
     WHERE hospital_id = ${h}::uuid AND state <> 'credit' GROUP BY 1`);
  const leadRows = await q<{ order_id: string; days: number }>(sql`
    SELECT o.id AS order_id, ((min(d.arrived_at))::date - (o.sent_at)::date) AS days
      FROM public.pharmacy_orders o JOIN public.pharmacy_deliveries d ON d.order_id = o.id
     WHERE o.hospital_id = ${h}::uuid AND o.sent_at IS NOT NULL GROUP BY o.id, o.sent_at`);
  const linesOfOrder = (id: string) => orderLines.filter((l) => l.order_id === id);

  /* ─── Shelves, counts ─── */
  const shelfRows = await q<{ id: string; code: string; name: string; controlled: boolean }>(sql`
    SELECT id, code, name, controlled FROM public.pharmacy_shelves WHERE location_id = ${S}::uuid AND archived_at IS NULL ORDER BY code`);
  const countRows = await q<{
    id: string;
    shelf_id: string;
    voucher: string;
    counted_at: string;
    diff_value: string;
    needs_sign: boolean;
    signed_at: string | null;
    stocktake_id: string | null;
    total: string;
  }>(sql`
    SELECT c.id, c.shelf_id, c.voucher, c.counted_at, c.diff_value, c.needs_sign, c.signed_at, c.stocktake_id,
           (SELECT coalesce(sum(l.expected * l.unit_cost), 0) FROM public.pharmacy_shelf_count_lines l WHERE l.count_id = c.id) AS total
      FROM public.pharmacy_shelf_counts c JOIN public.pharmacy_shelves s ON s.id = c.shelf_id
     WHERE s.location_id = ${S}::uuid ORDER BY c.counted_at DESC LIMIT 400`);
  const [take] = await q<{ id: string; started_at: string; closed_at: string | null }>(sql`
    SELECT id, started_at, closed_at FROM public.pharmacy_stocktakes WHERE location_id = ${S}::uuid
     ORDER BY closed_at IS NULL DESC, started_at DESC LIMIT 1`);
  const shelves = shelfRows.map((s) => {
    const mine = countRows.filter((c) => c.shelf_id === s.id);
    const lastDay = mine[0] ? kampala(iso(mine[0].counted_at)!).slice(0, 10) : null;
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      controlled: s.controlled,
      days: lastDay ? Math.round((Date.parse(today) - Date.parse(lastDay)) / 86_400_000) : null,
      countedToday: lastDay === today,
      waitingSign: mine.some((c) => c.needs_sign && !c.signed_at),
      inStocktake: !!take && !take.closed_at && mine.some((c) => c.stocktake_id === take.id),
    };
  });

  /* ─── Quarantine, losses, the room ─── */
  const quarantine = await q<{
    id: string;
    product_id: string;
    no: string;
    exp: string;
    qty: number;
    why: string | null;
  }>(sql`
    SELECT b.id, b.product_id, b.batch_number AS no, b.expiry::text AS exp, q.qty,
           (SELECT coalesce(m.reason_note, m.reason_code) FROM public.pharmacy_stock_movements m WHERE m.batch_id = b.id AND m.kind = 'quarantined_in'
             ORDER BY m.effective_at DESC LIMIT 1) AS why
      FROM public.pharmacy_batches b JOIN public.pharmacy_locations l ON l.id = b.location_id AND l.kind = 'quarantine'
      JOIN LATERAL (SELECT sum(m.quantity)::int AS qty FROM public.pharmacy_stock_movements m WHERE m.batch_id = b.id) q ON q.qty > 0
     WHERE b.hospital_id = ${h}::uuid ORDER BY b.expiry`);
  const losses = await q<{
    id: string;
    at: string;
    product_id: string;
    no: string;
    qty: number;
    reason: string;
    note: string | null;
    value: string;
    voucher: string;
    case_id: string | null;
  }>(sql`
    SELECT x.id, x.recorded_at AS at, b.product_id, b.batch_number AS no, x.qty, x.reason, x.note, x.value_ugx AS value, x.voucher, x.case_id
      FROM public.pharmacy_store_losses x JOIN public.pharmacy_batches b ON b.id = x.batch_id
     WHERE x.hospital_id = ${h}::uuid AND x.recorded_at >= ${addDays(today, -365)}::date ORDER BY x.recorded_at DESC`);
  const room = await q<{ at: string; temp: string; humidity: number }>(sql`
    SELECT read_at AS at, temp_c AS temp, humidity FROM public.pharmacy_store_room_readings
     WHERE location_id = ${S}::uuid AND read_at >= ${addDays(today, -31)}::date ORDER BY read_at`);
  const [fridge] = await q<{ id: string; code: string; sensor: string | null }>(sql`
    SELECT id, code, sensor_id AS sensor FROM public.pharmacy_fridges WHERE location_id = ${S}::uuid AND archived_at IS NULL
     ORDER BY sensor_id IS NOT NULL DESC, code LIMIT 1`);
  let coldRoom: StoreWorld["coldRoom"] = null;
  if (fridge) {
    const reads = await q<{ at: string; temp: string }>(sql`
      SELECT read_at AS at, temp_c AS temp FROM public.pharmacy_fridge_readings
       WHERE fridge_id = ${fridge.id}::uuid AND read_at >= ${now.toISOString()}::timestamptz - interval '24 hours' ORDER BY read_at`);
    const lines = await q<{ name: string }>(sql`
      SELECT DISTINCT p.name FROM public.pharmacy_products p
       WHERE p.hospital_id = ${h}::uuid AND p.cold_chain AND EXISTS (SELECT 1 FROM public.pharmacy_batches b
         JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id WHERE b.product_id = p.id AND b.location_id = ${S}::uuid
         GROUP BY b.id HAVING sum(m.quantity) > 0) ORDER BY p.name`);
    const week = await q<{ temp: string }>(sql`
      SELECT temp_c AS temp FROM public.pharmacy_fridge_readings
       WHERE fridge_id = ${fridge.id}::uuid AND read_at >= ${now.toISOString()}::timestamptz - interval '7 days'`);
    const history = reads.map((r) => ({ at: iso(r.at)!, temp: Number(r.temp) }));
    const todayReads = history
      .filter((r) => kampala(r.at).slice(0, 10) === today)
      .map((r) => r.temp);
    coldRoom = {
      code: fridge.code,
      sensor: fridge.sensor,
      fridgeId: fridge.id,
      temp: history.at(-1)?.temp ?? null,
      readAt: history.at(-1)?.at ?? null,
      min: todayReads.length ? Math.min(...todayReads) : null,
      max: todayReads.length ? Math.max(...todayReads) : null,
      history,
      outOfRange7d: week.filter((r) => outOfRange(Number(r.temp))).length,
      lines: lines.map((l) => l.name),
    };
  }

  /* ─── Balances, flow, days ─── */
  const balances = await q<{
    place_id: string;
    product_id: string;
    opening: number;
    received: number;
    used: number;
    sent: number;
    closing: number;
  }>(sql`
    SELECT location_id AS place_id, product_id, opening, received, used, sent, closing
      FROM public.pharmacy_place_balance_month WHERE hospital_id = ${h}::uuid AND month = ${monthStart}::date`);
  const caseRows = await q<{ location_id: string }>(sql`
    SELECT DISTINCT location_id FROM public.pharmacy_cases
     WHERE hospital_id = ${h}::uuid AND source_type = 'balance' AND created_at >= ${monthStart}::date AND signed_off_at IS NULL`);

  const firstMonday = addDays(mondayOf(today), -77);
  const flowRows = await q<{ week: string; product_id: string; in_q: number; out_q: number }>(sql`
    SELECT date_trunc('week', m.effective_at AT TIME ZONE 'Africa/Kampala')::date::text AS week, b.product_id,
           coalesce(sum(m.quantity) FILTER (WHERE m.kind IN ('received','returned_in')), 0)::int AS in_q,
           coalesce(-sum(m.quantity) FILTER (WHERE m.kind = 'issued'), 0)::int AS out_q
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
     WHERE m.location_id = ${S}::uuid AND m.effective_at >= ${firstMonday}::date GROUP BY 1, 2`);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(firstMonday, i * 7);
    const rows = flowRows.filter((r) => r.week === start);
    return {
      start,
      inValue: rows.reduce((a, r) => a + Number(r.in_q) * costOf(r.product_id), 0),
      outValue: rows.reduce((a, r) => a + Number(r.out_q) * costOf(r.product_id), 0),
    };
  });
  const placeDays = await q<{
    product_id: string;
    place_id: string;
    day: string;
    delta: number;
  }>(sql`
    SELECT b.product_id, coalesce(m.location_id, m.dispensing_point_id) AS place_id,
           (m.effective_at AT TIME ZONE 'Africa/Kampala')::date::text AS day, sum(m.quantity)::int AS delta
      FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
     WHERE m.hospital_id = ${h}::uuid AND m.effective_at >= ${monthStart}::date GROUP BY 1, 2, 3`);

  /* ─── Expiry acts, arranged transfers ─── */
  const expiryRows = await q<{
    batch_id: string;
    action: string;
    qty: number;
    voucher: string | null;
    to: string | null;
  }>(sql`
    SELECT DISTINCT ON (a.batch_id) a.batch_id, a.action, a.qty, a.voucher, l.name AS to
      FROM public.pharmacy_expiry_actions a LEFT JOIN public.pharmacy_locations l ON l.id = a.to_location_id
     WHERE a.hospital_id = ${h}::uuid ORDER BY a.batch_id, a.done_at DESC`);
  const expiryActions: Record<string, string> = {};
  for (const e of expiryRows)
    expiryActions[e.batch_id] = JSON.stringify({
      action: e.action,
      qty: Number(e.qty),
      voucher: e.voucher,
      to: e.to,
    });
  const transfersArranged = dispatches
    .filter((d) => d.kind === "transfer" && d.status === "transit")
    .flatMap((d) =>
      d.lines.map((l) => ({
        key: `${l.medId}|${d.fromId}|${d.toId}`,
        voucher: d.voucher,
        toId: d.toId,
        fromId: d.fromId,
        qty: l.qty,
        medId: l.medId,
      })),
    );

  /* ─── The stock card, only when one is open ─── */
  let card: StoreWorld["card"] = null;
  const cardMed = o.medId && known.has(o.medId) ? o.medId : o.cardOpen ? meds[0]?.id : null;
  if (cardMed) {
    const rows = await q<{
      at: string;
      kind: string;
      delta: number;
      by: string;
      voucher: string | null;
      party: string | null;
      count_voucher: string | null;
      loss_voucher: string | null;
      grn: string | null;
    }>(sql`
      SELECT m.effective_at AS at, m.kind, m.quantity AS delta, coalesce(u.full_name, u.email, '') AS by,
             i.voucher, l.name AS party, c.voucher AS count_voucher, x.voucher AS loss_voucher, d.note_number AS grn
        FROM public.pharmacy_stock_movements m
        JOIN public.pharmacy_batches b ON b.id = m.batch_id
        LEFT JOIN public.users u ON u.id = m.actor_user_id
        LEFT JOIN public.pharmacy_issues i ON i.id = m.source_id
        LEFT JOIN public.pharmacy_locations l ON l.id = CASE WHEN m.quantity < 0 THEN i.to_location_id ELSE i.from_location_id END
        LEFT JOIN public.pharmacy_shelf_counts c ON c.id = m.source_id
        LEFT JOIN public.pharmacy_store_losses x ON x.id = m.source_id OR x.quarantine_decision_id = m.source_id
        LEFT JOIN public.pharmacy_deliveries d ON d.id = m.source_id
       WHERE m.location_id = ${S}::uuid AND b.product_id = ${cardMed}::uuid
       ORDER BY m.effective_at DESC, m.id DESC LIMIT 500`);
    /* A count that matched moved nothing, so the ledger has no row for it; the card still says "0 diff" (§F3). */
    const matched = await q<{ at: string; voucher: string; by: string }>(sql`
      SELECT c.counted_at AS at, c.voucher, coalesce(u.full_name, u.email, '') AS by
        FROM public.pharmacy_shelf_count_lines l
        JOIN public.pharmacy_shelf_counts c ON c.id = l.count_id
        JOIN public.pharmacy_batches b ON b.id = l.batch_id
        LEFT JOIN public.users u ON u.id = c.counted_by
       WHERE b.product_id = ${cardMed}::uuid AND b.location_id = ${S}::uuid AND c.hospital_id = ${h}::uuid
       GROUP BY c.id, c.counted_at, c.voucher, u.full_name, u.email
      HAVING bool_and(l.expected = l.counted)
       ORDER BY c.counted_at DESC LIMIT 100`);
    card = {
      medId: cardMed,
      rows: [
        ...rows.map((r) => ({
          at: iso(r.at)!,
          ref: r.voucher ?? r.count_voucher ?? r.loss_voucher ?? r.grn ?? "",
          party: r.party ?? "",
          delta: Number(r.delta),
          by: r.by,
          isCount: r.kind === "count_correction",
        })),
        ...matched.map((r) => ({
          at: iso(r.at)!,
          ref: r.voucher,
          party: "",
          delta: 0,
          by: r.by,
          isCount: true,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    };
  }

  return {
    today,
    now: now.toISOString(),
    storeId: S,
    storeName: store.name,
    hospitalId: h,
    actor: { userId: o.actorUserId, inCharge: !!me?.in_charge, name: me?.name ?? "" },
    rules,
    meds,
    batches: batchRows.map((b) => ({
      id: b.id,
      medId: b.product_id,
      no: b.no,
      exp: b.exp,
      bin: b.bin,
      qty: Number(b.qty),
      waiting: b.waiting,
      grn: b.grn,
      receivedAt: iso(b.received_at),
      blocked: b.blocked,
    })),
    places,
    placeStock: [...stock.values()],
    dispatches,
    requisitions,
    runs: runRows.map((r) => ({
      id: r.id,
      placeId: r.place_id,
      weekdays: r.weekdays.map(Number),
      at: r.at,
      sentVoucher: r.voucher,
    })),
    returns: returnRows.map((r) => ({
      id: r.id,
      placeId: r.place_id,
      medId: r.product_id,
      no: r.no,
      exp: r.exp,
      qty: Number(r.qty),
      reason: r.reason,
      acceptedVoucher: r.voucher,
    })),
    orders: orderRows.map((x) => {
      const lines = linesOfOrder(x.id);
      return {
        id: x.id,
        supplierId: x.supplier_id,
        supplier: x.supplier ?? "",
        state: x.state,
        budget: Number(x.budget ?? 0),
        sentAt: iso(x.sent_at),
        createdAt: iso(x.created_at)!,
        received: lines.reduce((a, l) => a + Number(l.received), 0),
        ordered: lines.reduce((a, l) => a + Number(l.qty), 0),
        closedAt: iso(x.closed_at),
        lines: lines.map((l) => ({
          medId: l.product_id,
          qty: Number(l.qty),
          trimmed: l.cut != null,
        })),
      };
    }),
    suppliers: supplierRows.map((s) => {
      const os = orderRows.filter((x) => x.supplier_id === s.id && x.state !== "draft");
      const ls = os.flatMap((x) => linesOfOrder(x.id));
      return {
        id: s.id,
        name: s.name,
        ordered: ls.reduce((a, l) => a + Number(l.qty), 0),
        received: ls.reduce((a, l) => a + Number(l.received), 0),
        leadDays: leadRows
          .filter((r) => os.some((x) => x.id === r.order_id))
          .map((r) => Number(r.days)),
        promisedDays: Number(s.promised ?? 0),
        openOrder: os.some((x) => x.state === "open"),
        openClaims: Number(claimRows.find((c) => c.supplier_id === s.id)?.n ?? 0),
      };
    }),
    shelves,
    counts: countRows.map((c) => ({
      id: c.id,
      shelfId: c.shelf_id,
      voucher: c.voucher,
      countedAt: iso(c.counted_at)!,
      diffValue: Number(c.diff_value),
      needsSign: c.needs_sign,
      signed: !!c.signed_at,
      stocktakeId: c.stocktake_id,
      totalValue: Number(c.total),
    })),
    stocktake: take
      ? { id: take.id, startedAt: iso(take.started_at)!, closedAt: iso(take.closed_at) }
      : null,
    quarantine: quarantine.map((b) => ({
      id: b.id,
      medId: b.product_id,
      no: b.no,
      exp: b.exp,
      qty: Number(b.qty),
      why: b.why ?? "",
    })),
    losses: losses.map((l) => ({
      id: l.id,
      at: iso(l.at)!,
      medId: l.product_id,
      no: l.no,
      qty: Number(l.qty),
      reason: l.reason,
      note: l.note,
      value: Number(l.value),
      voucher: l.voucher,
      caseId: l.case_id,
    })),
    room: room.map((r) => ({ at: iso(r.at)!, temp: Number(r.temp), humidity: Number(r.humidity) })),
    coldRoom,
    balances: balances
      .filter((b) => placeIds.has(b.place_id) && known.has(b.product_id))
      .map((b) => ({
        placeId: b.place_id,
        medId: b.product_id,
        opening: Number(b.opening),
        received: Number(b.received),
        used: Number(b.used),
        sent: Number(b.sent),
        closing: Number(b.closing),
      })),
    balanceCases: caseRows.map((c) => c.location_id),
    weeks,
    storeDays: dayRows.map((d) => ({ medId: d.product_id, day: d.day, delta: Number(d.delta) })),
    placeDays: placeDays
      .filter((d) => placeIds.has(d.place_id))
      .map((d) => ({
        medId: d.product_id,
        placeId: d.place_id,
        day: d.day,
        delta: Number(d.delta),
      })),
    expiryActions,
    transfersArranged,
    card,
  };
}

/** Records › Losses: the closed stock-takes, newest first (STORE.md §F4). Empty until 0275 is applied. */
export async function loadStocktakeReports(db: Db, hospitalId: string) {
  const [ready] = rowsOf<{ ok: boolean }>(
    await db.execute(sql`SELECT to_regclass('public.pharmacy_stocktakes') IS NOT NULL AS ok`),
  );
  if (!ready?.ok) return [];
  const rows = rowsOf<{
    id: string;
    closed_at: string;
    by: string;
    report: { shelves: { code: string }[]; totalDiff: number } | null;
  }>(
    await db.execute(sql`
      SELECT t.id, t.closed_at, coalesce(u.full_name, u.email, '') AS by, t.report
        FROM public.pharmacy_stocktakes t LEFT JOIN public.users u ON u.id = t.closed_by
       WHERE t.hospital_id = ${hospitalId}::uuid AND t.closed_at IS NOT NULL
       ORDER BY t.closed_at DESC LIMIT 24`),
  );
  return rows.map((r) => ({
    id: r.id,
    closedAt: iso(r.closed_at)!,
    by: r.by,
    shelves: r.report?.shelves.length ?? 0,
    diff: Number(r.report?.totalDiff ?? 0),
  }));
}
