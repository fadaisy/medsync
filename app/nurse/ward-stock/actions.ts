"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import type { Who } from "@/lib/pharmacy/stores/ward-store";
import type { z } from "zod";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { WARDS } from "@/content/pharmacy-stores-wards";
import { actionError } from "@/lib/emr/write/context";
import { logger } from "@/lib/logger";
import { requireNurseScope } from "@/lib/nurse/scope";
import { pharmacyWardStockLiveFor } from "@/lib/pharmacy/feature";
import * as wards from "@/lib/pharmacy/stores/ward-store";
import { withLocationRight } from "@/lib/pharmacy/stores/write";
import { databaseRefusal } from "@/lib/pharmacy/write";

/**
 * Ward stock, the ward's side (5.3, 5.4; Section 8, Appendix A). A nurse holds no pharmacy permission
 * (PA2-5): each action names its hub right at the ward (`ward_act` for the nurse in charge, `ward_confirm`
 * for receipt where D-PH2-04 allows any nurse on the ward), checked inside the one transaction by
 * `withLocationRight`. Zod → the nurse (auth, AAL2) → the flag → the right → the write → `{ id, serverTime }`.
 * Passwords and codes are never logged.
 */
async function act<I extends { locationId: string }, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  right: "ward_act" | "ward_confirm",
  write: (who: Who, input: I) => Promise<R>,
): Promise<ActionResult<R>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    const scope = await requireNurseScope();
    if (!pharmacyWardStockLiveFor(scope.hospitalId))
      return { ok: false, code: "config", error: WARDS.flagOff };
    const who = { userId: scope.userId, hospitalId: scope.hospitalId };
    const data = await withLocationRight(who, parsed.data.locationId, right, (tx, _l, now) =>
      write({ tx, ...who, now }, parsed.data),
    );
    refresh();
    return { ok: true, id: data.id, serverTime: new Date().toISOString(), data, refreshed: true };
  } catch (e) {
    unstable_rethrow(e);
    const guard = databaseRefusal(e);
    if (guard) return { ok: false, code: "conflict", error: guard };
    try {
      return actionError(e);
    } catch {
      logger.error("nurse.ward_stock.action_failed", {
        error: e instanceof Error ? e.name : "unknown",
      });
      return { ok: false, code: "conflict", error: WARDS.failed };
    }
  }
}

/** `recordCount` at the ward (the nurse in charge: `ward_act`). Blind; WS-3. */
export async function recordWardCount(raw: unknown) {
  return act(wards.WardCountInput, raw, "ward_act", wards.recordWardCount);
}
/** `raiseRequisition` (the nurse in charge: `ward_act`). */
export async function raiseWardRequisition(raw: unknown) {
  return act(wards.WardRequisitionInput, raw, "ward_act", wards.raiseWardRequisition);
}
/** `returnStock` from the ward (`ward_act`): IS-5. */
export async function returnWardStock(raw: unknown) {
  return act(wards.WardReturnInput, raw, "ward_act", wards.returnWardStock);
}
/** The confirmer's own second factor for a receipt (`ward_confirm`). */
export async function attestOwnFactor(raw: unknown): Promise<ActionResult> {
  const r = await act(wards.AttestInput, raw, "ward_confirm", (who, input) =>
    wards.attestAtPlace(who, input, ["receipt"]),
  );
  if (!r.ok) return r;
  if (!r.data?.ok) return { ok: false, code: "forbidden", error: r.data?.words ?? "" };
  return { ok: true, id: r.id, serverTime: r.serverTime };
}
/** `confirmIssueReceipt` at the ward (`ward_confirm`, with the confirmer's second factor): IS-3. */
export async function confirmWardReceipt(raw: unknown) {
  return act(wards.ConfirmReceiptInput, raw, "ward_confirm", wards.confirmWardIssue);
}
