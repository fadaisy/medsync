import "server-only";

import type { ActionResult } from "@/lib/emr/write/context";
import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyDispensingLiveFor, storesFlagsFor } from "@/lib/pharmacy/feature";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { storeNeed } from "./write";

/**
 * The house contract for lane C's actions (Section 8): Zod with a client key → the actor (auth, AAL2, the pharmacy
 * affiliation) → the flag → the permission inside one transaction (`runPharmacyWrite`) → the Store pages
 * revalidated. A refusal comes back in words; the log names the action and the error's class only (an input may
 * hold a password or code, and a recall's patients are never logged).
 */
export type SupplyFlag = "recall" | "monthEnd" | "ordering" | "packs";

export const supplyFlagOn = (flag: SupplyFlag, hospitalId: string) => {
  const f = storesFlagsFor(hospitalId);
  if (flag === "packs")
    return Object.values(f).some(Boolean) || pharmacyDispensingLiveFor(hospitalId);
  return f[flag];
};

/** SL-14's own words, when the database refused a blocked batch (0180 `pharmacy_movement_guard`). */
export function guardWords(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/pharmacy_stock: batch (\S+) is (recalled|in quarantine)/);
  if (m) return `Batch ${m[1]} is ${m[2]}. It moves only into quarantine or back to the supplier.`;
  if (msg.includes("write-off and return to supplier are from quarantine only"))
    return "Write-off and return to the supplier are from quarantine only.";
  const cause = e && typeof e === "object" && "cause" in e ? (e as { cause: unknown }).cause : null;
  return cause ? guardWords(cause) : null;
}

export async function supplyAct<I, R extends { id: string }>(
  name: string,
  flag: SupplyFlag,
  schema: z.ZodType<I>,
  raw: unknown,
  permission: PharmacyPermission | readonly PharmacyPermission[],
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!supplyFlagOn(flag, actor.hospitalId))
      return { ok: false, code: "config", error: SUPPLY_COMMON.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, storeNeed(permission), write);
    if (result.ok) revalidatePath("/pharmacy", "layout");
    return result;
  } catch (e) {
    unstable_rethrow(e);
    const words = guardWords(e);
    if (words) return { ok: false, code: "conflict", error: words };
    logger.error("pharmacy.store.supply_action_failed", {
      action: name,
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: SUPPLY_COMMON.failed };
  }
}

/** The answer without the write's data. */
export const bareResult = <R>(r: ActionResult<R>): ActionResult =>
  r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;

/** An attestation's answer: a failure is recorded (committed) and returned in words. */
export const attestResult = (
  r: ActionResult<{ id: string; ok: boolean; words: string | null }>,
): ActionResult =>
  !r.ok
    ? r
    : r.data?.ok
      ? bareResult(r)
      : { ok: false, code: "forbidden", error: r.data?.words ?? "" };
