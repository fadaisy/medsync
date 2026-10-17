"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { requireEmrActor } from "@/lib/emr/actor";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { isDemoHospital, loadLabDemoDay } from "@/lib/lab/demo";
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
    const { loadId } = await loadLabDemoDay(database, actor, {
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
    return { ok: true, id: loadId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}
