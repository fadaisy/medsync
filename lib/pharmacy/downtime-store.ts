import "server-only";

import type { PharmacySheetState } from "@/lib/downtime/sheets";
import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import { db as appDb } from "@/db";
import { downtimeDrills, downtimeFormNumbers, downtimePeriods } from "@/db/schema/lab-safety";
import { nextSheetNumbers, periodErrors, sheetMove } from "@/lib/downtime/sheets";
import { EmrWriteError } from "@/lib/emr/write/context";
import { pharmacyDrill, pharmacySheetLabel } from "@/lib/pharmacy/downtime";
import { localDate } from "@/lib/pharmacy/stock/ledger";

/**
 * Pharmacy downtime set-up (Pharmacy Phase 1, 5.12, DT-2, DT-4, DT-11, H6; Section 8 "Downtime"):
 * blank sheets reserved and printed, a downtime period recorded with the sheets it used, a sheet
 * number voided, a drill recorded, a sheet completed. Every write goes through `runPharmacyWrite`
 * (the acting point, the permission, one transaction as the actor). Sheet numbers share the lab's
 * number space per hospital (0128, D-PH1-46) and its lock, so the two never reserve the same number.
 * Back-entry of the rows on a sheet is not here: it runs through the hand-over's transaction (DT-3).
 */

export const SHEETS_NEED: PharmacyNeed = { permission: "pharmacy.dispense", point: "downtime" };
/** DT-4, S72: recording a period (and voiding a sheet) is the in-charge's (`pharmacy.manage`). */
export const MANAGE_SHEETS_NEED: PharmacyNeed = {
  permission: "pharmacy.manage",
  point: "downtime",
};

const invalid = (m: string) => new EmrWriteError("invalid", m);
const at = (ctx: PharmacyCtx) => ctx.point!.id;

/** The lab's key (lib/lab/downtime-store.ts): one lock per hospital for the shared number space. */
const lockNumbers = (ctx: PharmacyCtx) =>
  ctx.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`downtime-forms:${ctx.actor.hospitalId}`}))`,
  );

export const ReserveInput = z.object({
  count: z.number().int().min(1, "Print 1 to 200 sheets.").max(200, "Print 1 to 200 sheets."),
});

/** DT-2, S67: a run after the highest number ever reserved here (lab or pharmacy), one per sheet. */
export async function reserveSheetNumbers(ctx: PharmacyCtx, input: z.infer<typeof ReserveInput>) {
  await lockNumbers(ctx);
  const [{ n }] = (await ctx.tx
    .select({ n: max(downtimeFormNumbers.number) })
    .from(downtimeFormNumbers)
    .where(eq(downtimeFormNumbers.hospitalId, ctx.actor.hospitalId))) as [{ n: number | null }];
  const numbers = nextSheetNumbers(n, input.count);
  await ctx.tx.insert(downtimeFormNumbers).values(
    numbers.map((number) => ({
      hospitalId: ctx.actor.hospitalId,
      number,
      workspace: "pharmacy" as const,
      dispensingPointId: at(ctx),
      reservedBy: ctx.actor.userId,
      reservedAt: ctx.now,
    })),
  );
  return { id: String(numbers[0]), numbers };
}

/** The point's pharmacy sheets with these numbers, locked for the move. */
async function sheetsAt(ctx: PharmacyCtx, numbers: readonly number[]) {
  return ctx.tx
    .select({ number: downtimeFormNumbers.number, state: downtimeFormNumbers.state })
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, ctx.actor.hospitalId),
        eq(downtimeFormNumbers.workspace, "pharmacy"),
        eq(downtimeFormNumbers.dispensingPointId, at(ctx)),
        inArray(downtimeFormNumbers.number, [...numbers]),
      ),
    )
    .for("update");
}

function checkMoves(
  wanted: readonly number[],
  found: readonly { number: number; state: string }[],
  to: PharmacySheetState,
) {
  const byNumber = new Map(found.map((s) => [s.number, s.state as PharmacySheetState]));
  for (const n of wanted) {
    const state = byNumber.get(n);
    if (!state) throw invalid(`${pharmacySheetLabel(n)} was not printed at this point.`);
    if (!sheetMove(state, to, "pharmacy"))
      throw new EmrWriteError(
        "conflict",
        `${pharmacySheetLabel(n)} is ${STATE_WORDS[state].toLowerCase()}.`,
      );
  }
}

export const STATE_WORDS: Record<PharmacySheetState, string> = {
  unused: "Not used",
  to_enter: "To enter",
  complete: "Complete",
  voided: "Voided",
};

export const PeriodInput = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.enum(["network", "power", "system", "other"]),
    note: z.string().trim().max(500).nullable(),
    sheets: z.array(z.number().int().positive()).max(200),
  })
  .refine((p) => new Set(p.sheets).size === p.sheets.length, "A sheet is named twice.");

/**
 * DT-2, DT-4, S72: a downtime period (start, end, reason) and the sheets used in it, which become
 * `to_enter`; the rest of the run stays unused. The in-charge's (`pharmacy.manage`).
 */
export async function recordDowntime(ctx: PharmacyCtx, input: z.infer<typeof PeriodInput>) {
  const errors = periodErrors({ ...input, now: ctx.now });
  if (errors.length)
    throw invalid(
      errors.includes("order")
        ? "The downtime ends after it starts."
        : errors.includes("future")
          ? "Record a downtime that has ended. A time here is in the future."
          : "Choose the reason.",
    );
  await lockNumbers(ctx);
  checkMoves(input.sheets, await sheetsAt(ctx, input.sheets), "to_enter");
  const [period] = await ctx.tx
    .insert(downtimePeriods)
    .values({
      hospitalId: ctx.actor.hospitalId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason,
      note: input.note || null,
      recordedBy: ctx.actor.userId,
      createdAt: ctx.now,
    })
    .returning({ id: downtimePeriods.id });
  if (input.sheets.length)
    await ctx.tx
      .update(downtimeFormNumbers)
      .set({ state: "to_enter", downtimePeriodId: period!.id })
      .where(
        and(
          eq(downtimeFormNumbers.hospitalId, ctx.actor.hospitalId),
          eq(downtimeFormNumbers.workspace, "pharmacy"),
          inArray(downtimeFormNumbers.number, input.sheets),
        ),
      );
  return { id: period!.id };
}

export const VoidInput = z.object({
  number: z.number().int().positive(),
  reason: z.string().trim().min(3, "Say why the sheet is voided.").max(200),
});

/** A sheet number never used (spoilt, lost): voided with a reason. The in-charge's. */
export async function voidSheetNumber(ctx: PharmacyCtx, input: z.infer<typeof VoidInput>) {
  checkMoves([input.number], await sheetsAt(ctx, [input.number]), "voided");
  await ctx.tx
    .update(downtimeFormNumbers)
    .set({ state: "voided", voidedReason: input.reason })
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, ctx.actor.hospitalId),
        eq(downtimeFormNumbers.number, input.number),
      ),
    );
  return { id: String(input.number) };
}

export const CompleteInput = z.object({ number: z.number().int().positive() });

/**
 * DT-2, S69: **Sheet complete** closes a sheet (to_enter → complete, once; 0128's guard refuses any
 * move back). Wired to the screen with back-entry, which enters the rows first.
 */
export async function completeSheet(ctx: PharmacyCtx, input: z.infer<typeof CompleteInput>) {
  checkMoves([input.number], await sheetsAt(ctx, [input.number]), "complete");
  await ctx.tx
    .update(downtimeFormNumbers)
    .set({ state: "complete", completedAt: ctx.now, completedBy: ctx.actor.userId })
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, ctx.actor.hospitalId),
        eq(downtimeFormNumbers.number, input.number),
      ),
    );
  return { id: String(input.number) };
}

export const DrillInput = z.object({
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date."),
  participants: z.string().trim().min(2, "Who took part?").max(500),
  whatWasDone: z.string().trim().min(3, "Say what was done.").max(1000),
  problems: z.string().trim().max(1000).nullable(),
});

/** DT-11, S77: a drill writes a `downtime_drills` row at this point, and nothing else. */
export async function recordDrill(ctx: PharmacyCtx, input: z.infer<typeof DrillInput>) {
  if (input.heldOn > localDate(ctx.now)) throw invalid("A drill is recorded after it is held.");
  const drill = pharmacyDrill({
    heldOn: input.heldOn,
    participants: input.participants,
    whatWasDone: input.whatWasDone,
    problems: input.problems || null,
    dispensingPointId: at(ctx),
  });
  const [row] = await ctx.tx
    .insert(downtimeDrills)
    .values({
      hospitalId: ctx.actor.hospitalId,
      ...drill,
      recordedBy: ctx.actor.userId,
      createdAt: ctx.now,
    })
    .returning({ id: downtimeDrills.id });
  return { id: row!.id };
}

/* ─── Reads (owner, scoped to the hospital and point; no patient data) ─── */

const defaultDb = () => appDb as unknown as EmrDb;

/** The nav count: pharmacy sheets still to enter at this hospital (5.12). Unused sheets do not count. */
export async function countSheetsToEnter(hospitalId: string, database: EmrDb = defaultDb()) {
  const [r] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, hospitalId),
        eq(downtimeFormNumbers.workspace, "pharmacy"),
        eq(downtimeFormNumbers.state, "to_enter"),
      ),
    );
  return r?.n ?? 0;
}

/** The downtime page: the point's sheets, the hospital's recent periods, the point's drills. */
export async function loadDowntimePage(
  hospitalId: string,
  pointId: string,
  database: EmrDb = defaultDb(),
) {
  const [sheets, periods, drills] = await Promise.all([
    database
      .select({
        number: downtimeFormNumbers.number,
        state: downtimeFormNumbers.state,
        reservedAt: downtimeFormNumbers.reservedAt,
        periodId: downtimeFormNumbers.downtimePeriodId,
        completedAt: downtimeFormNumbers.completedAt,
        voidedReason: downtimeFormNumbers.voidedReason,
      })
      .from(downtimeFormNumbers)
      .where(
        and(
          eq(downtimeFormNumbers.hospitalId, hospitalId),
          eq(downtimeFormNumbers.workspace, "pharmacy"),
          eq(downtimeFormNumbers.dispensingPointId, pointId),
        ),
      )
      .orderBy(desc(downtimeFormNumbers.number))
      .limit(400),
    database
      .select()
      .from(downtimePeriods)
      .where(eq(downtimePeriods.hospitalId, hospitalId))
      .orderBy(desc(downtimePeriods.startsAt))
      .limit(20),
    database
      .select()
      .from(downtimeDrills)
      .where(
        and(
          eq(downtimeDrills.hospitalId, hospitalId),
          eq(downtimeDrills.workspace, "pharmacy"),
          eq(downtimeDrills.dispensingPointId, pointId),
        ),
      )
      .orderBy(desc(downtimeDrills.heldOn))
      .limit(10),
  ]);
  return {
    sheets: sheets.map((s) => ({ ...s, state: s.state as PharmacySheetState })),
    periods,
    drills,
  };
}

/** Whether this person holds `pharmacy.manage` here now (a hub head assignment, read in SQL; PA2-3). */
export async function managesPharmacy(
  userId: string,
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<boolean> {
  const rows = (await database.execute(
    sql`SELECT private.pharmacy_can_user(${userId}::uuid, ${hospitalId}::uuid, 'pharmacy.manage') AS ok`,
  )) as unknown as { ok: boolean }[] | { rows: { ok: boolean }[] };
  return (Array.isArray(rows) ? rows : rows.rows)[0]?.ok === true;
}
