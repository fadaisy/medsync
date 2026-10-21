import "server-only";

import type { ActionResult } from "@/lib/emr/write/context";
import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { STORE } from "@/content/pharmacy-stores-store";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { storeNeed } from "./write";

/**
 * The house contract for a Store action (Section 8): Zod with a client key → the actor (auth, AAL2, the pharmacy
 * affiliation; `pharmacy.store` added from map v3 where PHARMACY_STORE is on) → `pharmacyStore` for the hospital →
 * the permission inside one transaction (`runPharmacyWrite`) → the store's pages revalidated. A refusal comes back
 * in words. The log names the action and the error's class only: never the input, which may hold a witness's
 * password or code.
 */
export async function storeAct<I, R extends { id: string }>(
  name: string,
  schema: z.ZodType<I>,
  raw: unknown,
  permission: PharmacyPermission | readonly PharmacyPermission[],
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyStoreLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: STORE.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, storeNeed(permission), write);
    if (result.ok) revalidatePath("/pharmacy/store", "layout");
    return result;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.store.action_failed", {
      action: name,
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: STORE.failed };
  }
}

/** The answer without the write's data, for actions whose data the client does not need. */
export const bare = <R>(r: ActionResult<R>): ActionResult =>
  r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;
