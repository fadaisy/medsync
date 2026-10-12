"use server";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { StockResult as ActionResult } from "@/lib/pharmacy/stock/store";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { DOWNTIME_ENTRY, DOWNTIME_PAGE } from "@/content/pharmacy-golive";
import { identitiesFor } from "@/lib/emr/read/results";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import * as entry from "@/lib/pharmacy/downtime-entry";
import * as sheets from "@/lib/pharmacy/downtime-store";
import { pharmacyDispensingLiveFor, pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import * as log from "@/lib/pharmacy/print/log-read";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Downtime entry and the dispensing log (Pharmacy Phase 1, Section 8 "Downtime" and "Stock"; 5.12).
 * The house contract: Zod with a client key → the actor (auth, AAL2, the pharmacy affiliation, the
 * acting point) → the flag for the hospital (`pharmacyDowntime` for entry, `pharmacyDispensing` for the
 * log) → the permission and the point inside one transaction (`runPharmacyWrite`, PA2-4).
 */
type Flag = "downtime" | "dispensing";
const LIVE: Record<Flag, (h: string) => boolean> = {
  downtime: pharmacyDowntimeLiveFor,
  dispensing: pharmacyDispensingLiveFor,
};

async function act<I, R extends { id: string }>(
  flag: Flag,
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!LIVE[flag](actor.hospitalId))
      return { ok: false, code: "config", error: DOWNTIME_PAGE.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, need, write);
    if (result.ok) refresh();
    return result;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.downtime_entry.action_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, code: "conflict", error: DOWNTIME_ENTRY.failed };
  }
}

/** DT-3 to DT-10: one row of a sheet. */
export async function enterDowntimeRow(raw: unknown) {
  return act("downtime", entry.RowInput, raw, entry.ENTRY_NEED, entry.enterDowntimeRow);
}

/** DT-2, S69: Sheet complete. */
export async function completeSheet(raw: unknown) {
  return act("downtime", sheets.CompleteInput, raw, sheets.SHEETS_NEED, sheets.completeSheet);
}

/** DL-1: the pharmacy in charge confirms the log's column map. */
export async function confirmLogColumns(raw: unknown) {
  return act(
    "dispensing",
    log.ConfirmColumnsInput,
    raw,
    log.MANAGE_LOG_NEED,
    log.confirmLogColumns,
  );
}

/** Section 8 `printDispensingLog`: logs the print. */
export async function printDispensingLog(raw: unknown) {
  return act("dispensing", log.PrintLogInput, raw, log.PRINT_LOG_NEED, log.printDispensingLog);
}

const FindInput = z.object({ patientNumber: z.string().trim().min(1).max(40) });

export type EntryPatient = NonNullable<Awaited<ReturnType<typeof entry.patientForEntry>>> & {
  identity: PatientIdentity | null;
};

/**
 * The row's patient, by MedSync number, at this hospital (5.12). A read: Zod, the actor, the flag,
 * `pharmacy.dispense`. Not registered → null, and the screen says to register at reception (S73).
 */
export async function findPatientForEntry(raw: unknown): Promise<EntryPatient | null> {
  const parsed = FindInput.safeParse(raw);
  if (!parsed.success) return null;
  const actor = await requirePharmacyActor();
  if (!pharmacyDowntimeLiveFor(actor.hospitalId)) return null;
  if (!actor.access.permissions.has("pharmacy.dispense")) return null;
  const found = await entry.patientForEntry(actor.hospitalId, parsed.data.patientNumber);
  if (!found) return null;
  const ids = await identitiesFor(actor, [found.patientUserId], "pharmacy_downtime_entry");
  return { ...found, identity: ids.get(found.patientUserId) ?? null };
}
