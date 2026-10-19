"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { requireEmrActor } from "@/lib/emr/actor";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { isDemoHospital, loadLabDemo } from "@/lib/lab/demo";
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
