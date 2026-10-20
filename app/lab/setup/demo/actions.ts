"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { requireEmrActor } from "@/lib/emr/actor";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { isDemoHospital, loadLabDemo, removeLabDemo } from "@/lib/lab/demo";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Load a demo lab day" (Lab Phase 5, owner request; A19): `lab.manage`, a demo hospital only. Demo patients get
 * accounts that can never sign in (banned for a century, an `.invalid` address); their records carry "Demo" in the
 * name and are listed against the load.
 */
export async function loadDemoDayAction(): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor("lab");
    if (!(actor.labPermissions ?? []).includes("lab.manage"))
      throw new EmrWriteError("forbidden", "Only the laboratory lead loads demo data.");
    const database = db as never;
    if (!(await isDemoHospital(database, actor.hospitalId)))
      throw new EmrWriteError("forbidden", "Demo data goes only into a demo hospital.");
    const admin = createServiceClient().auth.admin;
    const { loadId, notes } = await loadLabDemo(database, actor, {
      makePatientUser: async (label) => {
        const { data, error } = await admin.createUser({
          email: `lab-demo-${crypto.randomUUID()}@demo.medsync.invalid`,
          email_confirm: true,
          ban_duration: "876000h",
          user_metadata: { full_name: label, medsync_lab_demo: true },
        });
        if (error || !data.user) throw new Error(`Could not create ${label}.`);
        return data.user.id;
      },
    });
    revalidatePath("/lab", "layout");
    const stopped = Object.keys(notes);
    return {
      ok: true,
      id: loadId,
      serverTime: new Date().toISOString(),
      ...(stopped.length
        ? { warnings: [`Some sections stopped: ${stopped.join(", ")}. See Loads below.`] }
        : {}),
    };
  } catch (e) {
    if (e instanceof EmrWriteError) return actionError(e);
    // Anything else (an account that could not be made, a database refusal) is said on the page, never a crash.
    const message = e instanceof Error ? e.message : String(e);
    logger.error("lab.demo.load_failed", { message: message.slice(0, 300) });
    return {
      ok: false,
      code: "config",
      error: `The demo load stopped: ${message.slice(0, 200)}. See Loads below.`,
    };
  }
}

/**
 * Remove the demo (owner request, 20 Oct 2026; migration 0178): `lab.manage`, a demo hospital only. One transaction
 * deletes every demo row; the SQL function writes the audit row. A second press removes nothing, so the client key
 * needs no store.
 */
export async function removeDemoAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ clientKey: z.string().min(8).max(120) }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Try again." };
  try {
    const actor = await requireEmrActor("lab");
    if (!(actor.labPermissions ?? []).includes("lab.manage"))
      throw new EmrWriteError("forbidden", "Only the laboratory lead removes demo data.");
    const database = db as never;
    if (!(await isDemoHospital(database, actor.hospitalId)))
      throw new EmrWriteError("forbidden", "Demo data is removed only from a demo hospital.");
    await removeLabDemo(database, actor.hospitalId, actor.userId);
    revalidatePath("/lab", "layout");
    return { ok: true, id: actor.hospitalId, serverTime: new Date().toISOString() };
  } catch (e) {
    if (e instanceof EmrWriteError) return actionError(e);
    // A real record pointing at demo data (a foreign key) stops the whole removal; say so on the page.
    const message = e instanceof Error ? e.message : String(e);
    logger.error("lab.demo.remove_failed", { message: message.slice(0, 300) });
    return {
      ok: false,
      code: "config",
      error: `Nothing was removed: ${message.slice(0, 200)}.`,
    };
  }
}
