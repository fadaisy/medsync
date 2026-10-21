import "server-only";

import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { Who } from "@/lib/pharmacy/stores/ward-store";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { WARDS } from "@/content/pharmacy-stores-wards";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyCartsLiveFor, pharmacyWardStockLiveFor } from "@/lib/pharmacy/feature";
import { whoOf } from "@/lib/pharmacy/stores/ward-store";
import { storeNeed } from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * The pharmacy side of ward stock and carts (Section 8). The house contract: Zod → the actor (auth, AAL2,
 * the pharmacy affiliation) → the flag for the hospital → the permission inside one transaction
 * (`runPharmacyWrite`) → the place checked inside it → the page refreshed in the same response. A refusal
 * comes back in words. Passwords and codes are never logged: only the error's name is.
 */
export async function act<I, R extends { id: string }>(
  flag: "wards" | "carts",
  schema: z.ZodType<I>,
  raw: unknown,
  permission: PharmacyPermission,
  write: (who: Who, input: I, ctx: PharmacyCtx) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    const on = flag === "wards" ? pharmacyWardStockLiveFor : pharmacyCartsLiveFor;
    if (!on(actor.hospitalId)) return { ok: false, code: "config", error: WARDS.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, storeNeed(permission), (ctx, input) =>
      write(whoOf(ctx), input, ctx),
    );
    if (!result.ok) return result;
    refresh();
    return { ...result, refreshed: true };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.stores.wards.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: WARDS.failed };
  }
}

/** A second factor's answer: a failure is recorded (committed) and returned in words. */
export const attestAnswer = (
  r: ActionResult<{ id: string; ok: boolean; words: string | null }>,
): ActionResult =>
  !r.ok
    ? r
    : r.data?.ok
      ? { ok: true, id: r.id, serverTime: r.serverTime }
      : { ok: false, code: "forbidden", error: r.data?.words ?? "" };
