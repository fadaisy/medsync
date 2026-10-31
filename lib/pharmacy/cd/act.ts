import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { Who } from "@/lib/pharmacy/cd/store";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { CTL } from "@/content/pharmacy-rework-controls";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { fail, storeNeed } from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * The Controls actions' one path (rework TECH-SPEC §4): Zod → the pharmacy actor → the permission inside one
 * transaction (`runPharmacyWrite`) → the write as the signed-in person, with their place chip as their station.
 * The database's own refusals (0267) come back in its words; the witness rules (0265) in `databaseRefusal`'s.
 */
export type Result = { ok: true; id: string } | { ok: false; error: string };

export const ANY: readonly PharmacyPermission[] = ["pharmacy.controlled", "pharmacy.stock", "pharmacy.store", "pharmacy.dispense", "pharmacy.manage"];

/** 0267's messages are written for people: "pharmacy_cases: fix the number at the source first" → "Fix the number…". */
export function controlsWords(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/pharmacy_(?:cd|cases|shift_handovers|control_resolutions): ([^\n"]+)/);
  if (m) return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).trim()}.`;
  const cause = e && typeof e === "object" && "cause" in e ? (e as { cause: unknown }).cause : null;
  return cause ? controlsWords(cause) : null;
}

export async function controlsAct<I, R extends { id: string }>(
  name: string,
  schema: z.ZodType<I>,
  raw: unknown,
  permission: PharmacyPermission | readonly PharmacyPermission[],
  write: (who: Who & { station: string | null }, input: I) => Promise<R>,
): Promise<Result> {
  try {
    const actor = await requirePharmacyActor();
    const r = await runPharmacyWrite(schema, raw, actor, storeNeed(permission), async (ctx, input) => {
      try {
        return await write({ tx: ctx.tx, userId: actor.userId, hospitalId: actor.hospitalId, now: ctx.now, station: actor.pointId }, input);
      } catch (e) {
        const words = controlsWords(e);
        if (words) throw fail("conflict", words);
        throw e;
      }
    });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/pharmacy", "layout");
    return { ok: true, id: r.id };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.controls.action_failed", { action: name, error: e instanceof Error ? e.name : "unknown" });
    return { ok: false, error: CTL.common.failed };
  }
}

/** A read for a dialog, as the pharmacy actor. */
export async function controlsRead<T>(read: (db: EmrDb, a: { hospitalId: string; userId: string; station: string | null }) => Promise<T>) {
  const actor = await requirePharmacyActor();
  const { db } = await import("@/db");
  return read(db as unknown as EmrDb, { hospitalId: actor.hospitalId, userId: actor.userId, station: actor.pointId });
}
