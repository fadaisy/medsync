import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { Reading } from "@/lib/pharmacy/cold/derive";
import type { TodayItem } from "@/lib/pharmacy/derive/today-types";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { fill, PRW } from "@/content/pharmacy-rework-patients";
import { excursions } from "@/lib/pharmacy/cold/derive";
import { DAY } from "@/lib/pharmacy/wards/derive";
import { q } from "@/lib/pharmacy/wards/sql";

/** Cold chain reads: one loader for the tab (4 queries), one for Today. */
const appDb = async () => (await import("@/db")).db as unknown as EmrDb;

export interface FridgeRow {
  id: string;
  code: string;
  name: string;
  model: string | null;
  locationId: string;
  place: string;
  placeKind: string;
  sensor: boolean;
  last: Reading | null;
  min24: number | null;
  max24: number | null;
}

export const coldChainData = cache(
  async (
    hospitalId: string,
    fridgeId: string | null,
    nowMs: number,
    atLocation?: string,
    database?: EmrDb,
  ) => {
    const db = database ?? (await appDb());
    const now = new Date(nowMs);
    const fridges = (
      await q<{
        id: string;
        code: string;
        name: string;
        model: string | null;
        location_id: string;
        place: string;
        place_kind: string;
        sensor: boolean;
        last_at: string | null;
        last_v: string | null;
        min24: string | null;
        max24: string | null;
      }>(
        db,
        sql`SELECT f.id, f.code, f.name, f.model, f.location_id, l.name AS place, l.kind AS place_kind, f.sensor_key_hash IS NOT NULL AS sensor,
                 last.read_at AS last_at, last.temp_c AS last_v, d.min24, d.max24
            FROM public.pharmacy_fridges f JOIN public.pharmacy_locations l ON l.id = f.location_id
            LEFT JOIN LATERAL (SELECT read_at, temp_c FROM public.pharmacy_fridge_readings r
                                WHERE r.fridge_id = f.id ORDER BY read_at DESC LIMIT 1) last ON true
            LEFT JOIN LATERAL (SELECT min(temp_c) AS min24, max(temp_c) AS max24 FROM public.pharmacy_fridge_readings r
                                WHERE r.fridge_id = f.id AND r.read_at > ${new Date(nowMs - DAY).toISOString()}::timestamptz) d ON true
           WHERE f.hospital_id = ${hospitalId}::uuid AND f.archived_at IS NULL ORDER BY f.code`,
      )
    ).map(
      (f): FridgeRow => ({
        id: f.id,
        code: f.code,
        name: f.name,
        model: f.model,
        locationId: f.location_id,
        place: f.place,
        placeKind: f.place_kind,
        sensor: f.sensor,
        last: f.last_at ? { at: new Date(f.last_at).getTime(), v: Number(f.last_v) } : null,
        min24: f.min24 == null ? null : Number(f.min24),
        max24: f.max24 == null ? null : Number(f.max24),
      }),
    );
    const f =
      fridges.find((x) => x.id === fridgeId) ??
      fridges.find((x) => x.locationId === atLocation) ??
      fridges[0];
    if (!f) return { fridges, fridge: null };
    const k = new Date(nowMs + 3 * 3_600_000);
    const monthStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 3 * 3_600_000;
    const from = new Date(Math.min(monthStart, nowMs - 30 * DAY));
    const [readings, acks, stock] = await Promise.all([
      q<{
        read_at: string;
        temp_c: string;
        source: "sensor" | "chart";
        slot: "am" | "pm" | null;
        fi: "ok" | "x" | null;
        initials: string | null;
      }>(
        db,
        sql`SELECT read_at, temp_c, source, slot, freeze_indicator AS fi, initials FROM public.pharmacy_fridge_readings
           WHERE fridge_id = ${f.id}::uuid AND read_at >= ${from.toISOString()}::timestamptz AND read_at <= ${now.toISOString()}::timestamptz ORDER BY read_at`,
      ),
      q<{ start: string; actions: string[]; at: string }>(
        db,
        sql`SELECT excursion_start AS start, actions, acted_at AS at FROM public.pharmacy_excursion_acks
           WHERE fridge_id = ${f.id}::uuid`,
      ),
      // Every product with stock somewhere at the hospital, its balance here and elsewhere, and whether it is listed.
      q<{
        product_id: string;
        name: string;
        listed: boolean;
        place_id: string;
        place: string;
        place_kind: string;
        balance: number;
        batches: { id: string; no: string; exp: string; n: number }[] | null;
      }>(
        db,
        sql`WITH bal AS (
            SELECT b.product_id, coalesce(b.location_id, b.dispensing_point_id) AS place_id, b.id, b.batch_number, b.expiry,
                   sum(m.quantity)::int AS n
              FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
             WHERE b.hospital_id = ${hospitalId}::uuid GROUP BY b.id HAVING sum(m.quantity) > 0)
          SELECT p.id AS product_id, p.name,
                 EXISTS (SELECT 1 FROM public.pharmacy_fridge_contents c WHERE c.fridge_id = ${f.id}::uuid
                           AND c.product_id = p.id AND c.ended_at IS NULL) AS listed,
                 bal.place_id, l.name AS place, l.kind AS place_kind, sum(bal.n)::int AS balance,
                 CASE WHEN bal.place_id = ${f.locationId}::uuid
                      THEN json_agg(json_build_object('id', bal.id, 'no', bal.batch_number, 'exp', bal.expiry, 'n', bal.n)
                                    ORDER BY bal.expiry) END AS batches
            FROM public.pharmacy_products p
            LEFT JOIN bal ON bal.product_id = p.id
            LEFT JOIN public.pharmacy_locations l ON l.id = bal.place_id
           WHERE p.hospital_id = ${hospitalId}::uuid
             AND (bal.product_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.pharmacy_fridge_contents c
                   WHERE c.fridge_id = ${f.id}::uuid AND c.product_id = p.id AND c.ended_at IS NULL))
           GROUP BY p.id, p.name, bal.place_id, l.name, l.kind ORDER BY p.name`,
      ),
    ]);
    const products = new Map<
      string,
      {
        id: string;
        name: string;
        listed: boolean;
        here: number;
        batches: { id: string; no: string; exp: string; n: number }[];
        elsewhere: { placeId: string; place: string; kind: string; n: number }[];
      }
    >();
    for (const s of stock) {
      const p = products.get(s.product_id) ?? {
        id: s.product_id,
        name: s.name,
        listed: s.listed,
        here: 0,
        batches: [],
        elsewhere: [],
      };
      if (s.place_id === f.locationId) {
        p.here = Number(s.balance);
        p.batches = s.batches ?? [];
      } else if (s.place_id)
        p.elsewhere.push({
          placeId: s.place_id,
          place: s.place,
          kind: s.place_kind,
          n: Number(s.balance),
        });
      products.set(s.product_id, p);
    }
    const all = readings.map((r) => ({
      ...r,
      at: new Date(r.read_at).getTime(),
      v: Number(r.temp_c),
    }));
    const sensor = all.filter((r) => r.source === "sensor");
    // Excursions from the sensor where there is one, else from the chart readings.
    const series = sensor.length ? sensor : all;
    const exc = excursions(series.filter((r) => r.at >= nowMs - 30 * DAY)).map((e) => {
      const a = acks.find((x) => Math.abs(new Date(x.start).getTime() - e.start) < 1000);
      return { ...e, ack: a ? { actions: a.actions, at: new Date(a.at).getTime() } : null };
    });
    return {
      fridges,
      fridge: f,
      monthStart,
      series: series.map(({ at, v }) => ({ at, v })),
      chart: all
        .filter((r) => r.source === "chart" && r.at >= monthStart)
        .map((r) => ({
          day: Math.floor((r.at - monthStart) / DAY) + 1,
          slot: r.slot!,
          v: r.v,
          initials: r.initials ?? "",
          fi: r.fi,
        })),
      sensor: sensor.filter((r) => r.at >= monthStart).map(({ at, v }) => ({ at, v })),
      excursions: exc,
      products: [...products.values()],
    };
  },
);
export type ColdChainData = Awaited<ReturnType<typeof coldChainData>>;

const dur = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;

/** Today, kind `cold`: excursions in the last 7 days nobody has acted on yet. */
export async function coldTodayItems(
  hospitalId: string,
  now = new Date(),
  database?: EmrDb,
): Promise<TodayItem[]> {
  const db = database ?? (await appDb());
  const rows = await q<{
    fridge_id: string;
    name: string;
    read_at: string;
    temp_c: string;
    source: string;
  }>(
    db,
    sql`SELECT r.fridge_id, f.name, r.read_at, r.temp_c, r.source FROM public.pharmacy_fridge_readings r
          JOIN public.pharmacy_fridges f ON f.id = r.fridge_id
         WHERE f.hospital_id = ${hospitalId}::uuid AND f.archived_at IS NULL AND r.read_at > ${new Date(now.getTime() - 7 * DAY).toISOString()}::timestamptz
         ORDER BY r.fridge_id, r.read_at`,
  );
  const acks = await q<{ fridge_id: string; start: string }>(
    db,
    sql`SELECT fridge_id, excursion_start AS start FROM public.pharmacy_excursion_acks WHERE hospital_id = ${hospitalId}::uuid
          AND excursion_start > ${new Date(now.getTime() - 8 * DAY).toISOString()}::timestamptz`,
  );
  const out: TodayItem[] = [];
  for (const id of new Set(rows.map((r) => r.fridge_id))) {
    const mine = rows.filter((r) => r.fridge_id === id);
    const sensor = mine.filter((r) => r.source === "sensor");
    const series = (sensor.length ? sensor : mine).map((r) => ({
      at: new Date(r.read_at).getTime(),
      v: Number(r.temp_c),
    }));
    for (const e of excursions(series)) {
      if (
        acks.some(
          (a) => a.fridge_id === id && Math.abs(new Date(a.start).getTime() - e.start) < 1000,
        )
      )
        continue;
      out.push({
        kind: "cold",
        key: `cold:${id}:${e.start}`,
        title: fill(PRW.today.coldOpen, {
          fridge: mine[0]!.name,
          kind: (e.kind === "high"
            ? PRW.cold.status.high
            : e.frozen
              ? PRW.cold.status.freeze
              : PRW.cold.status.low)!,
          dur: dur(e.mins),
        }),
        meta: `${e.kind === "high" ? "+" : ""}${e.peak.toFixed(1)} °C`,
        action: PRW.today.coldAct,
        href: "/pharmacy/setup?tab=places",
        late: true,
      });
    }
  }
  return out;
}
