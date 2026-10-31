import "server-only";

import { createHash } from "node:crypto";
import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { PRW } from "@/content/pharmacy-rework-patients";
import { pharmacyStockMovements } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyExcursionAcks,
  pharmacyFridgeContents,
  pharmacyFridgeReadings,
  pharmacyFridges,
} from "@/db/schema/pharmacy-rework-patients";
import { EPI_NEED, runPatientsWrite } from "@/lib/pharmacy/epi/store";
import { issueStock } from "@/lib/pharmacy/stores/issue-store";
import { fail, loadLocation, placeCols, requireLive } from "@/lib/pharmacy/stores/write";
import { q } from "@/lib/pharmacy/wards/sql";

/** Cold chain writes (TECH-SPEC §4 Cold). Readings and acknowledgements are append-only; listings end. */
type Opts = { database?: EmrDb; now?: Date };

async function fridgeOf(ctx: PharmacyCtx, id: string) {
  const [f] = await ctx.tx
    .select()
    .from(pharmacyFridges)
    .where(
      and(
        eq(pharmacyFridges.id, id),
        eq(pharmacyFridges.hospitalId, ctx.actor.hospitalId),
        isNull(pharmacyFridges.archivedAt),
      ),
    );
  if (!f) throw fail("not_found", PRW.cold.noFridges);
  return f;
}

export const ReadingInput = z.object({
  fridgeId: z.uuid(),
  slot: z.enum(["am", "pm"]),
  tempC: z.number().min(-30).max(40),
  fi: z.enum(["ok", "x"]).nullable(),
  initials: z.string().trim().min(1).max(6),
});

/** The am or pm reading from the thermometer, typed, with the reader's initials (and the FI in the afternoon). */
export const recordReading = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    ReadingInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const f = await fridgeOf(ctx, i.fridgeId);
      if (i.slot === "pm" && !i.fi) throw fail("invalid", PRW.cold.fiNeeded);
      const [r] = await ctx.tx
        .insert(pharmacyFridgeReadings)
        .values({
          hospitalId: f.hospitalId,
          fridgeId: f.id,
          readAt: ctx.now,
          tempC: i.tempC.toFixed(1),
          source: "chart",
          slot: i.slot,
          freezeIndicator: i.fi,
          initials: i.initials.toUpperCase(),
          recordedBy: ctx.actor.userId,
        })
        .returning({ id: pharmacyFridgeReadings.id });
      return { id: r!.id };
    },
    o,
  );

export const AckInput = z.object({
  fridgeId: z.uuid(),
  start: z.iso.datetime({ offset: true }),
  actions: z.array(z.string().min(2).max(80)).min(1).max(10),
});

export const ackExcursion = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    AckInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const f = await fridgeOf(ctx, i.fridgeId);
      const shake = i.actions.find((a) => a.startsWith("Shake test"));
      const [r] = await ctx.tx
        .insert(pharmacyExcursionAcks)
        .values({
          hospitalId: f.hospitalId,
          fridgeId: f.id,
          excursionStart: new Date(i.start),
          actions: i.actions,
          shakeTest: shake ? (shake.endsWith("failed") ? "failed" : "passed") : null,
          actedBy: ctx.actor.userId,
        })
        .onConflictDoNothing()
        .returning({ id: pharmacyExcursionAcks.id });
      return { id: r?.id ?? f.id };
    },
    o,
  );

export const AddInput = z.object({
  clientKey: z.uuid(),
  fridgeId: z.uuid(),
  productId: z.uuid(),
  moveFrom: z.uuid().nullable(),
  quantity: z.number().int().min(1).max(1_000_000).nullable(),
});

/** List a medicine in a fridge, and optionally move stock in from another place (an issue, earliest expiry first). */
export const addToFridge = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    AddInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const f = await fridgeOf(ctx, i.fridgeId);
      await ctx.tx
        .insert(pharmacyFridgeContents)
        .values({
          hospitalId: f.hospitalId,
          fridgeId: f.id,
          productId: i.productId,
          addedBy: ctx.actor.userId,
        })
        .onConflictDoNothing();
      if (i.moveFrom && i.quantity) {
        const from = await loadLocation(ctx.tx, f.hospitalId, i.moveFrom);
        const to = await loadLocation(ctx.tx, f.hospitalId, f.locationId);
        await issueStock(ctx, {
          id: i.clientKey,
          kind: "issue",
          from,
          to,
          requisitionId: null,
          lines: [{ productId: i.productId, quantity: i.quantity }],
        });
      }
      return { id: f.id };
    },
    o,
  );

export const CAUSES = ["expired", "vvm", "frozen", "heat", "damaged", "recalled"] as const;
export const TakeOutInput = z
  .object({
    clientKey: z.uuid(),
    fridgeId: z.uuid(),
    productId: z.uuid(),
    how: z.enum(["move", "discard", "unlist"]),
    quantity: z.number().int().min(1).max(1_000_000).nullable(),
    batchId: z.uuid().nullable(),
    to: z.uuid().nullable(),
    cause: z.enum(CAUSES).nullable(),
  })
  .refine((v) => v.how === "unlist" || (v.quantity && (v.how === "move" ? v.to : v.cause)));

/**
 * Take a medicine out: move it elsewhere (an issue from this place), discard it as unusable (`adjusted` with
 * reason 'wastage:<cause>', one line per batch, earliest expiry first unless a batch is chosen), or stop listing it.
 * Taking all of it out also ends the listing.
 */
export const takeOutOfFridge = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    TakeOutInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const f = await fridgeOf(ctx, i.fridgeId);
      const place = await loadLocation(ctx.tx, f.hospitalId, f.locationId);
      let left = 1;
      if (i.how === "move") {
        const to = await loadLocation(ctx.tx, f.hospitalId, i.to!);
        await issueStock(ctx, {
          id: i.clientKey,
          kind: "issue",
          from: place,
          to,
          requisitionId: null,
          lines: [{ productId: i.productId, quantity: i.quantity! }],
        });
      }
      if (i.how === "discard") {
        requireLive(place);
        const [again] = await q<{ id: string }>(
          ctx.tx,
          sql`SELECT id FROM public.pharmacy_stock_movements WHERE idempotency_key = ${`discard:${i.clientKey}`} LIMIT 1`,
        );
        if (again) return { id: f.id };
        const batches = await q<{ id: string; balance: number }>(
          ctx.tx,
          sql`SELECT b.id, sum(m.quantity)::int AS balance FROM public.pharmacy_batches b
              JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
             WHERE coalesce(b.location_id, b.dispensing_point_id) = ${place.id}::uuid
               AND b.product_id = ${i.productId}::uuid ${i.batchId ? sql`AND b.id = ${i.batchId}::uuid` : sql``}
             GROUP BY b.id HAVING sum(m.quantity) > 0 ORDER BY min(b.expiry), b.id`,
        );
        let need = i.quantity!;
        for (const b of batches) {
          if (!need) break;
          const n = Math.min(need, Number(b.balance));
          await ctx.tx.insert(pharmacyStockMovements).values({
            hospitalId: f.hospitalId,
            ...placeCols(place),
            batchId: b.id,
            kind: "adjusted",
            quantity: -n,
            effectiveAt: ctx.now,
            actorUserId: ctx.actor.userId,
            reasonCode: `wastage:${i.cause}`,
            sourceKind: "adjustment",
            sourceId: f.id,
            idempotencyKey: `discard:${i.clientKey}`,
          });
          need -= n;
        }
        if (need) throw fail("conflict", PRW.cold.notEnough);
      }
      if (i.how !== "unlist") {
        const [s] = await q<{ n: number }>(
          ctx.tx,
          sql`SELECT coalesce(sum(m.quantity), 0)::int AS n FROM public.pharmacy_stock_movements m
              JOIN public.pharmacy_batches b ON b.id = m.batch_id
             WHERE coalesce(m.location_id, m.dispensing_point_id) = ${place.id}::uuid AND b.product_id = ${i.productId}::uuid`,
        );
        left = Number(s?.n ?? 0);
      }
      if (i.how === "unlist" || left <= 0)
        await ctx.tx
          .update(pharmacyFridgeContents)
          .set({ endedAt: ctx.now, endedBy: ctx.actor.userId })
          .where(
            and(
              eq(pharmacyFridgeContents.fridgeId, f.id),
              eq(pharmacyFridgeContents.productId, i.productId),
              isNull(pharmacyFridgeContents.endedAt),
            ),
          );
      return { id: f.id };
    },
    o,
  );

/* ─── Sensor ingest (no person: the fridge's own key) ───────────────── */
export const SensorInput = z.object({
  fridge: z.uuid(),
  readings: z
    .array(z.object({ at: z.iso.datetime({ offset: true }), tempC: z.number().min(-40).max(60) }))
    .min(1)
    .max(500),
});

export const sensorKeyHash = (key: string) =>
  createHash("sha256").update(key, "utf8").digest("hex");

/** Store a sensor's samples when its key matches the fridge's. Re-sent samples are ignored. */
export async function ingestSensor(db: EmrDb, key: string, input: z.infer<typeof SensorInput>) {
  const [f] = await db
    .select({
      id: pharmacyFridges.id,
      h: pharmacyFridges.hospitalId,
      hash: pharmacyFridges.sensorKeyHash,
    })
    .from(pharmacyFridges)
    .where(and(eq(pharmacyFridges.id, input.fridge), isNull(pharmacyFridges.archivedAt)));
  if (!f?.hash || f.hash !== sensorKeyHash(key)) return null;
  const now = Date.now();
  const rows = input.readings
    .filter((r) => Date.parse(r.at) <= now + 60_000)
    .map((r) => ({
      hospitalId: f.h,
      fridgeId: f.id,
      readAt: new Date(r.at),
      tempC: r.tempC.toFixed(1),
      source: "sensor" as const,
    }));
  if (rows.length) await db.insert(pharmacyFridgeReadings).values(rows).onConflictDoNothing();
  return rows.length;
}
