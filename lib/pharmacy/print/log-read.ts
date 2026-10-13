import "server-only";

import type { DispensingLog, LogColumnMap, LogFact, LogSupply } from "./dispensing-log";
import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";

import { CORRECTION_REASONS, REVERSAL_REASONS } from "@/content/pharmacy-supply";
import { db as appDb } from "@/db";
import {
  paperPrescriptionLines,
  pharmacyBatches,
  pharmacyHandovers,
  pharmacyHospitalSettings,
  pharmacyPrintEvents,
  pharmacyProducts,
  pharmacySupplies,
  pharmacySupplyCorrections,
  pharmacySupplyReversals,
} from "@/db/schema/pharmacy-dispensing";
import { prescriptions } from "@/db/schema/prescribing";
import { pharmacySheetLabel } from "@/lib/pharmacy/downtime";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { dispensingLog } from "./dispensing-log";

/**
 * The Daily Dispensing Log, read and confirmed (Pharmacy Phase 1, 5.12, DL-1 to DL-3). One row per
 * supply event (one batch) at the point whose `supplied_at` falls on the hospital-local day, so a
 * back-entered supply lands on the day it was supplied (DL-2). A reversed or in-error supply stays,
 * struck through with the reason. Rows = supply events (DL-3): nothing is filtered here.
 */

const defaultDb = () => appDb as unknown as EmrDb;
const DAY_MS = 86_400_000;

const FACTS = [
  "time",
  "patient_name",
  "medsync_number",
  "medicine",
  "quantity",
  "batch",
  "expiry",
  "prescription",
  "supplied_by",
] as const satisfies readonly LogFact[];

const ColumnsSchema = z
  .array(
    z.object({
      heading: z.string().trim().min(1, "Give each column its heading.").max(60),
      fact: z.enum(FACTS).nullable(),
    }),
  )
  .min(1)
  .max(20);

/** The hospital's column map, or null while none is stored. */
export async function logColumnMap(
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<LogColumnMap | null> {
  const [row] = await database
    .select({
      columns: pharmacyHospitalSettings.logColumns,
      confirmedAt: pharmacyHospitalSettings.logColumnsConfirmedAt,
    })
    .from(pharmacyHospitalSettings)
    .where(eq(pharmacyHospitalSettings.hospitalId, hospitalId));
  const parsed = ColumnsSchema.safeParse((row?.columns as { columns?: unknown } | null)?.columns);
  if (!parsed.success) return null;
  return { confirmed: row!.confirmedAt !== null, columns: parsed.data };
}

export type Names = (patientIds: string[]) => Promise<Map<string, { name: string; mrn: string }>>;

/** DL-1: `getDispensingLog(point, day)`, rendered through `dispensingLog` with the hospital's map. */
export async function getDispensingLog(
  hospitalId: string,
  pointId: string,
  day: string,
  names: Names,
  database: EmrDb = defaultDb(),
): Promise<DispensingLog & { supplyEvents: number }> {
  const start = startOfLocalDay(new Date(`${day}T12:00:00+03:00`), DEFAULT_TIME_ZONE);
  const end = new Date(start.getTime() + DAY_MS);
  const [rows, map] = await Promise.all([
    database
      .select({
        id: pharmacySupplies.id,
        suppliedAt: pharmacySupplies.suppliedAt,
        patientUserId: pharmacySupplies.patientUserId,
        drug: prescriptions.drugName,
        paper: paperPrescriptionLines.medicineAsWritten,
        product: pharmacyProducts.name,
        strength: pharmacyProducts.strength,
        quantity: pharmacySupplies.quantity,
        unit: pharmacySupplies.issueUnit,
        batch: pharmacyBatches.batchNumber,
        expiry: pharmacyBatches.expiry,
        cadre: pharmacyHandovers.actorCadre,
        downtime: pharmacyHandovers.enteredAfterDowntime,
        enteredAt: pharmacyHandovers.enteredAt,
        sheet: pharmacyHandovers.sheetNumber,
        reversedAt: pharmacySupplyReversals.reversedAt,
        reversedCadre: pharmacySupplyReversals.actorCadre,
        reversedReason: pharmacySupplyReversals.reasonCode,
        correctedReason: pharmacySupplyCorrections.reasonCode,
      })
      .from(pharmacySupplies)
      .innerJoin(pharmacyHandovers, eq(pharmacyHandovers.id, pharmacySupplies.handoverId))
      .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacySupplies.productId))
      .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacySupplies.batchId))
      .leftJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
      .leftJoin(
        paperPrescriptionLines,
        eq(paperPrescriptionLines.id, pharmacySupplies.paperPrescriptionLineId),
      )
      .leftJoin(pharmacySupplyReversals, eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id))
      .leftJoin(
        pharmacySupplyCorrections,
        eq(pharmacySupplyCorrections.supplyId, pharmacySupplies.id),
      )
      .where(
        and(
          eq(pharmacySupplies.hospitalId, hospitalId),
          eq(pharmacySupplies.dispensingPointId, pointId),
          gte(pharmacySupplies.suppliedAt, start),
          lt(pharmacySupplies.suppliedAt, end),
        ),
      ),
    logColumnMap(hospitalId, database),
  ]);
  const who = await names([...new Set(rows.map((r) => r.patientUserId))]);
  const supplies: LogSupply[] = rows.map((r) => ({
    id: r.id,
    suppliedAt: r.suppliedAt.toISOString(),
    patientName: who.get(r.patientUserId)?.name ?? "",
    medsyncNumber: who.get(r.patientUserId)?.mrn ?? "",
    medicine: [r.product, r.strength].filter(Boolean).join(", "),
    quantity: r.quantity,
    issueUnit: r.unit,
    batchNumber: r.batch,
    expiry: String(r.expiry),
    prescription: r.drug ?? (r.paper !== null ? `Paper: ${r.paper}` : ""),
    suppliedBy: r.cadre ?? "",
    downtime:
      r.downtime && r.sheet !== null
        ? { enteredAt: r.enteredAt.toISOString(), sheetNumber: pharmacySheetLabel(r.sheet) }
        : null,
    reversal: r.reversedAt
      ? {
          at: r.reversedAt.toISOString(),
          byCadre: r.reversedCadre ?? "",
          reason:
            REVERSAL_REASONS[r.reversedReason as keyof typeof REVERSAL_REASONS] ??
            r.reversedReason ??
            "",
        }
      : null,
    inError: r.correctedReason
      ? {
          reason:
            CORRECTION_REASONS[r.correctedReason as keyof typeof CORRECTION_REASONS] ??
            r.correctedReason,
        }
      : null,
  }));
  return { ...dispensingLog(supplies, map, DEFAULT_TIME_ZONE), supplyEvents: rows.length };
}

/* ─── Writes ────────────────────────────────────────────────────────── */

export const MANAGE_LOG_NEED: PharmacyNeed = { permission: "pharmacy.manage", point: "none" };
export const PRINT_LOG_NEED: PharmacyNeed = { permission: "pharmacy.dispense", point: "setup" };

export const ConfirmColumnsInput = z.object({ clientKey: z.uuid(), columns: ColumnsSchema });

/** DL-1: the pharmacy in charge confirms the column map against the hospital's HMIS 016 book. */
export async function confirmLogColumns(
  ctx: PharmacyCtx,
  input: z.infer<typeof ConfirmColumnsInput>,
) {
  const values = {
    logColumns: { columns: input.columns },
    logColumnsConfirmedBy: ctx.actor.userId,
    logColumnsConfirmedAt: ctx.now,
    updatedBy: ctx.actor.userId,
    updatedAt: ctx.now,
  };
  await ctx.tx
    .insert(pharmacyHospitalSettings)
    .values({ hospitalId: ctx.actor.hospitalId, ...values })
    .onConflictDoUpdate({ target: pharmacyHospitalSettings.hospitalId, set: values });
  return { id: ctx.actor.hospitalId };
}

export const PrintLogInput = z.object({
  clientKey: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Section 8 `printDispensingLog`: the print is logged with who and the point (LB-4's pattern). */
export async function printDispensingLog(ctx: PharmacyCtx, input: z.infer<typeof PrintLogInput>) {
  const [done] = await ctx.tx
    .select({ id: pharmacyPrintEvents.id })
    .from(pharmacyPrintEvents)
    .where(eq(pharmacyPrintEvents.id, input.clientKey));
  if (done) return { id: done.id };
  await ctx.tx.insert(pharmacyPrintEvents).values({
    id: input.clientKey,
    hospitalId: ctx.actor.hospitalId,
    dispensingPointId: ctx.point!.id,
    kind: "dispensing_log",
    actorUserId: ctx.actor.userId,
    printedAt: ctx.now,
  });
  return { id: input.clientKey };
}
