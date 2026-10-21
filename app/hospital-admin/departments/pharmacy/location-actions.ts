"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import type { Admin } from "@/lib/pharmacy/stores/location-store";
import type { z } from "zod";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { STORE } from "@/content/pharmacy-stores-store";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError } from "@/lib/emr/write/context";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { storesFlagsFor } from "@/lib/pharmacy/feature";
import * as places from "@/lib/pharmacy/stores/location-store";

/**
 * Going live per location (Pharmacy Phase 2, 5.12, GL2-1; Section 8 switchLocationOn/Off). The Phase 1 go-live
 * contract: Zod → the hospital-admin scope (auth, AAL2, the hospital from the session) → a Phase 2 flag on for
 * the hospital → one transaction as the admin, so the audit triggers stamp who did it → the page refreshed. The
 * second admin's password and code reach the server once, in `attestLocationApprover`, and are never logged.
 */
async function asAdmin<I, R>(
  schema: z.ZodType<I>,
  raw: unknown,
  write: (tx: EmrTx, admin: Admin, input: I, now: Date) => Promise<R>,
): Promise<ActionResult<R>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    const scope = await requireHospitalAdminScope();
    const f = storesFlagsFor(scope.hospitalId);
    if (!f.store && !f.wardStock && !f.carts)
      return { ok: false, code: "config", error: STORE.flagOff };
    const admin = { userId: scope.userId, hospitalId: scope.hospitalId };
    const data = await asClinicalWriter(admin, (tx) => write(tx, admin, parsed.data, new Date()));
    refresh();
    return {
      ok: true,
      id: typeof data === "string" ? data : "",
      serverTime: new Date().toISOString(),
      data,
    };
  } catch (e) {
    unstable_rethrow(e);
    const r = actionError(e);
    if (!r.ok && r.code !== "invalid" && r.code !== "conflict" && r.code !== "forbidden")
      logger.error("pharmacy.location_golive.action_failed", { code: r.code });
    return r;
  }
}

/** D-PH2-23: the second hospital admin proves who they are. A failed try is recorded and counts to the lock. */
export async function attestLocationApprover(raw: unknown): Promise<ActionResult> {
  const r = await asAdmin(places.ApproverInput, raw, places.attestApprover);
  if (!r.ok) return r;
  if (!r.data?.ok) return { ok: false, code: "forbidden", error: r.data?.words ?? "" };
  return { ok: true, id: r.data.id, serverTime: r.serverTime };
}
export async function switchLocation(raw: unknown): Promise<ActionResult> {
  const r = await asAdmin(places.SwitchLocationInput, raw, places.switchLocation);
  return r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;
}
export async function recordLocationBriefing(raw: unknown): Promise<ActionResult> {
  const r = await asAdmin(places.LocationBriefingInput, raw, places.recordLocationBriefing);
  return r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;
}
export async function recordLocationDrill(raw: unknown): Promise<ActionResult> {
  const r = await asAdmin(places.LocationDrillInput, raw, places.recordLocationDrill);
  return r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;
}
