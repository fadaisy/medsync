import "server-only";

import type { NextStep } from "./engine";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";
import { stockValue } from "@/lib/pharmacy/prices/engine";
import { placeValues } from "@/lib/pharmacy/prices/store";
import { expiresOn, localDate } from "@/lib/pharmacy/stock/ledger";
import { unconfirmedOverdue } from "@/lib/pharmacy/stores/issue";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import { buildProposal } from "@/lib/pharmacy/stores/order-read";
import { recalledAmong } from "@/lib/pharmacy/stores/recall-read";
import {
  cartListOf,
  confirmationWindowHours,
  countFreshnessDays,
  lastChecks,
  packQuantities,
  packsOf,
} from "@/lib/pharmacy/stores/ward-read";
import { cartSignals, nextStep } from "./engine";
import { sealsOf } from "./store";

type Db = EmrDb | EmrTx;
const q = async <T>(d: Db, query: ReturnType<typeof sql>) => rowsOf<T>(await d.execute(query));
const HOUR = 3_600_000;

export type HowKnown = "every" | "counted" | "issueOnly" | "cart";

/**
 * 4.10 (ADR 0466): one row per place with how its stock is known, its value at cost, what is out (vital first), what
 * expires within the hospital's look-ahead, its last count or check and whether it is fresh, issues not confirmed and
 * their age, a broken seal, and one next step from the fixed list. Values and holdings are the ledger's sums (S45);
 * an issue-only ward shows no balance (S47).
 */
export async function hospitalStockMap(d: Db, hospitalId: string, now: Date) {
  const today = localDate(now);
  const { ledger, balance, values } = await placeValues(d, hospitalId);
  const places = [...ledger.locations.values()];
  const cartIds = places.filter((p) => p.kind === "cart").map((p) => p.id);
  const [freshness, windowHours, settings, placed, counts, checks, seals, issues, ven] =
    await Promise.all([
      countFreshnessDays(d, hospitalId),
      confirmationWindowHours(d, hospitalId),
      q<{ n: number | null }>(
        d,
        sql`SELECT expiry_lookahead_days AS n FROM public.pharmacy_hospital_settings WHERE hospital_id = ${hospitalId}::uuid`,
      ),
      q<{ product_id: string; location_id: string }>(
        d,
        sql`SELECT product_id, location_id FROM public.pharmacy_product_locations
           WHERE hospital_id = ${hospitalId}::uuid AND active`,
      ),
      q<{ location_id: string; at: string }>(
        d,
        sql`SELECT location_id, max(counted_at) AS at FROM public.pharmacy_counts
           WHERE hospital_id = ${hospitalId}::uuid AND location_id IS NOT NULL GROUP BY location_id`,
      ),
      lastChecks(d, cartIds),
      sealsOf(d, cartIds),
      q<{ id: string; to_location_id: string; issued_at: string }>(
        d,
        sql`SELECT i.id, i.to_location_id, i.issued_at FROM public.pharmacy_issues i
           WHERE i.hospital_id = ${hospitalId}::uuid
             AND NOT EXISTS (SELECT 1 FROM public.pharmacy_issue_confirmations c WHERE c.issue_id = i.id)`,
      ),
      q<{ medicine_id: string; ven: string | null }>(
        d,
        sql`SELECT l.medicine_id, r.ven_class AS ven FROM public.pharmacy_medicine_links l
            JOIN public.pharmacy_national_list_rows r ON r.id = l.row_id ORDER BY l.linked_at DESC`,
      ),
    ]);
  const lookahead = settings[0]?.n ?? null;
  const vital = new Set<string>();
  const seenVen = new Set<string>();
  for (const v of ven)
    if (!seenVen.has(v.medicine_id)) {
      seenVen.add(v.medicine_id);
      if (v.ven === "V") vital.add(v.medicine_id);
    }
  const lastCount = new Map(counts.map((c) => [c.location_id, new Date(c.at)]));
  const overdueIds = (() => {
    const r = unconfirmedOverdue(
      issues.map((i) => ({ ...i, issuedAt: new Date(i.issued_at), confirmedAt: null })),
      now,
      windowHours,
    );
    return "overdue" in r ? new Set(r.overdue.map((i) => i.id)) : null;
  })();

  // What each place should hold: its placed products, a ward's signed levels, a cart's signed list.
  const expected = new Map<string, Set<string>>();
  for (const p of placed)
    expected.set(p.location_id, (expected.get(p.location_id) ?? new Set()).add(p.product_id));
  const cartLists = new Map<string, ReturnType<typeof cartListOf> | null>();
  for (const p of places) {
    if (p.kind === "ward" && p.model !== "issue_only") {
      const packs = await packsOf(d, p.id, "ward_levels");
      for (const id of packQuantities(packs.signed?.content, "levels").keys())
        expected.set(p.id, (expected.get(p.id) ?? new Set()).add(id));
    }
    if (p.kind === "cart") {
      const packs = await packsOf(d, p.id, "cart_list");
      const list = packs.signed ? cartListOf(packs.signed.content) : null;
      cartLists.set(p.id, list);
      for (const id of list?.items.keys() ?? [])
        expected.set(p.id, (expected.get(p.id) ?? new Set()).add(id));
    }
  }

  const held = new Map<string, Map<string, number>>(); // place → product → units
  const expiringAt = new Map<string, number>();
  const horizon = lookahead === null ? null : addDays(today, lookahead);
  for (const b of ledger.batches) {
    const n = balance.get(b.id) ?? 0;
    if (n <= 0) continue;
    const at = held.get(b.pointId) ?? new Map<string, number>();
    at.set(b.productId, (at.get(b.productId) ?? 0) + n);
    held.set(b.pointId, at);
    if (horizon !== null && expiresOn(b) <= horizon)
      expiringAt.set(b.pointId, (expiringAt.get(b.pointId) ?? 0) + 1);
  }
  const storeHolds = new Set(
    places.filter((p) => p.kind === "store").flatMap((p) => [...(held.get(p.id)?.keys() ?? [])]),
  );

  const rows = places.map((p) => {
    const how: HowKnown =
      p.kind === "cart"
        ? "cart"
        : p.kind === "ward"
          ? p.model === "issue_only"
            ? "issueOnly"
            : "counted"
          : "every";
    const units = held.get(p.id) ?? new Map<string, number>();
    const out = [...(expected.get(p.id) ?? [])]
      .filter((id) => !units.get(id))
      .map((id) => {
        const pr = ledger.products.get(id);
        return {
          productId: id,
          name: pr?.name ?? "",
          vital: !!pr && vital.has(pr.medicineId),
          storeHolds: storeHolds.has(id),
        };
      })
      .sort((a, b) => Number(b.vital) - Number(a.vital) || a.name.localeCompare(b.name));
    const last = p.kind === "cart" ? (checks.get(p.id) ?? null) : (lastCount.get(p.id) ?? null);
    const stale =
      how === "counted" &&
      (!last || (freshness !== null && now.getTime() - last.getTime() > freshness * 86_400_000));
    const mine = issues.filter((i) => i.to_location_id === p.id);
    const oldest = mine.reduce(
      (a, i) => Math.min(a, new Date(i.issued_at).getTime()),
      now.getTime(),
    );
    const list = cartLists.get(p.id) ?? null;
    const signal =
      p.kind === "cart"
        ? cartSignals({
            lastCheckAt: last,
            seals: seals
              .filter((s) => s.locationId === p.id)
              .map((s) => ({ kind: s.kind, at: s.reportedAt })),
            resusDoses: [],
          })
        : null;
    const cartDue =
      p.kind === "cart" &&
      !!list?.checkIntervalDays &&
      (!last || now.getTime() - last.getTime() > list.checkIntervalDays * 86_400_000);
    const sealBroken = !!signal?.why.includes("seal_broken");
    const overdue = overdueIds ? mine.filter((i) => overdueIds.has(i.id)).length : 0;
    const v = values.get(p.id) ?? { valueUgx: 0, unvalued: [] };
    const next: NextStep = nextStep({
      kind: p.kind,
      sealBroken,
      cartDue,
      overdueIssues: overdue,
      stale,
      out: out.length,
      expiring: expiringAt.get(p.id) ?? 0,
      held: units.size,
    });
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      live: p.live,
      how,
      // S47: an issue-only ward shows no balance.
      value: how === "issueOnly" ? null : v.valueUgx,
      unvalued: how === "issueOnly" ? 0 : v.unvalued.length,
      units: how === "issueOnly" ? null : [...units.values()].reduce((a, n) => a + n, 0),
      out,
      expiring: how === "issueOnly" ? 0 : (expiringAt.get(p.id) ?? 0),
      last,
      stale,
      unconfirmed: {
        n: mine.length,
        oldestHours: mine.length ? Math.floor((now.getTime() - oldest) / HOUR) : 0,
      },
      overdue,
      sealBroken,
      cartDue: cartDue || sealBroken,
      next,
    };
  });
  const counted = rows.filter((r) => r.value !== null);
  return {
    rows,
    figures: {
      valueUgx: Math.round(counted.reduce((a, r) => a + r.value!, 0) * 100) / 100,
      vitalOut: new Set(rows.flatMap((r) => r.out.filter((o) => o.vital).map((o) => o.productId)))
        .size,
      expiring: rows.reduce((a, r) => a + r.expiring, 0),
      stale: rows.filter((r) => r.stale).length,
      unconfirmed: rows.reduce((a, r) => a + r.unconfirmed.n, 0),
      carts: rows.filter((r) => r.cartDue).length,
    },
    windowSigned: windowHours !== null,
    lookahead,
    freshness,
    products: [...ledger.products.values()]
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export type StockMap = Awaited<ReturnType<typeof hospitalStockMap>>;

/**
 * 4.15 (ADR 0466): one product across the hospital. Holdings per place and per batch (both the ledger's sums, S48),
 * batch state (recalled, quarantined), monthly use and weeks of cover from the ordering engine (or why not), what is
 * on order, and every movement in the period in words, newest first, with who.
 */
export async function medicineTrace(
  d: Db,
  hospitalId: string,
  productId: string,
  period: { from: Date; to: Date },
  now: Date,
) {
  const { ledger, balance, rows } = await placeValues(d, hospitalId);
  const product = ledger.products.get(productId);
  if (!product) return null;
  const batches = ledger.batches.filter((b) => b.productId === productId);
  const [recalled, recalls] = await Promise.all([
    recalledAmong(
      d,
      hospitalId,
      batches.map((b) => b.id),
    ),
    q<{ id: string; batch_number: string | null }>(
      d,
      sql`SELECT id, batch_number FROM public.pharmacy_recalls
           WHERE hospital_id = ${hospitalId}::uuid AND product_id = ${productId}::uuid
           ORDER BY started_at DESC`,
    ),
  ]);
  // S49: a recalled batch opens its recall's trace (who received it).
  const recallOf = (batchNumber: string) =>
    recalls.find(
      (r) => !r.batch_number || r.batch_number.toLowerCase() === batchNumber.toLowerCase(),
    )?.id ?? null;
  const byPlace = new Map<string, number>();
  for (const b of batches)
    byPlace.set(b.pointId, (byPlace.get(b.pointId) ?? 0) + (balance.get(b.id) ?? 0));
  const where = [...byPlace]
    .filter(([, n]) => n !== 0)
    .map(([id, n]) => {
      const l = ledger.locations.get(id);
      return {
        placeId: id,
        name: l?.name ?? "",
        kind: l?.kind ?? "store",
        issueOnly: l?.kind === "ward" && l.model === "issue_only",
        units: n,
        batches: batches
          .filter((b) => b.pointId === id && (balance.get(b.id) ?? 0) !== 0)
          .map((b) => b.batchNumber),
      };
    })
    .sort((a, b) => b.units - a.units);
  const batchRows = batches
    .map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      expiry: b.expiry,
      expiryMonthOnly: b.expiryMonthOnly,
      placeId: b.pointId,
      place: ledger.locations.get(b.pointId)?.name ?? "",
      units: balance.get(b.id) ?? 0,
      recalled: recalled.has(b.id),
      recallId: recallOf(b.batchNumber),
      quarantined: ledger.locations.get(b.pointId)?.kind === "quarantine",
    }))
    .filter((b) => b.units !== 0)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const ids = new Set(batches.map((b) => b.id));
  const [moves, onOrder, proposal] = await Promise.all([
    ids.size
      ? q<{
          id: string;
          batch_id: string;
          kind: string;
          quantity: number;
          effective_at: string;
          place: string;
          who: string | null;
        }>(
          d,
          sql`SELECT m.id, m.batch_id, m.kind, m.quantity, m.effective_at,
                     coalesce(m.location_id, m.dispensing_point_id) AS place, u.full_name AS who
                FROM public.pharmacy_stock_movements m
                LEFT JOIN public.users u ON u.id = m.actor_user_id
               WHERE m.batch_id IN (${sql.join(
                 [...ids].map((id) => sql`${id}::uuid`),
                 sql`, `,
               )})
                 AND m.effective_at >= ${period.from.toISOString()}::timestamptz
                 AND m.effective_at < ${period.to.toISOString()}::timestamptz
               ORDER BY m.effective_at DESC, m.recorded_at DESC`,
        )
      : [],
    q<{ n: number | null }>(
      d,
      sql`SELECT sum(coalesce(l.chosen_units, l.proposed_units))::int AS n
            FROM public.pharmacy_order_lines l JOIN public.pharmacy_orders o ON o.id = l.order_id
           WHERE o.hospital_id = ${hospitalId}::uuid AND o.state = 'open' AND l.closed_at IS NULL
             AND l.product_id = ${productId}::uuid`,
    ),
    buildProposal(d, hospitalId, now, [product.medicineId]),
  ]);
  const line = proposal.lines.find((l) => l.medicineId === product.medicineId) ?? null;
  const inHospital = batchRows.reduce((a, b) => a + b.units, 0);
  const batchNumber = new Map(batches.map((b) => [b.id, b.batchNumber]));
  return {
    product,
    figures: {
      inHospital,
      valueUgx: stockValue(rows.filter((r) => ids.has(r.batchId))).valueUgx,
      perMonth: line?.amc ?? null,
      coverWeeks:
        line?.amc && line.amc > 0 ? Math.round(((inHospital / line.amc) * 365.25) / 12 / 7) : null,
      batches: batchRows.length,
      onOrder: onOrder[0]?.n ?? 0,
    },
    useMissing: line ? [] : proposal.missing,
    where,
    batches: batchRows,
    movements: moves.map((m) => ({
      id: m.id,
      kind: m.kind,
      quantity: Number(m.quantity),
      at: new Date(m.effective_at),
      place: ledger.locations.get(m.place)?.name ?? "",
      batchNumber: batchNumber.get(m.batch_id) ?? "",
      who: m.who ?? "",
    })),
  };
}
export type MedicineTrace = NonNullable<Awaited<ReturnType<typeof medicineTrace>>>;
