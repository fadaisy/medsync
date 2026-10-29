"use server";

import type { EmrDb } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { db } from "@/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { isDemoHospital, loadPharmacyDemo, removePharmacyDemo } from "@/lib/pharmacy/demo";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Load the pharmacy demo" (owner request, 26 Oct 2026; ADR 0450): the hospital admin, a demo hospital only. Demo
 * staff and patients get accounts that can never sign in (banned for a century, an `.invalid` address); their names
 * start with "Demo" and every patient is listed against the load.
 */
export async function loadPharmacyDemoAction(): Promise<ActionResult> {
  try {
    const scope = await requireHospitalAdminScope();
    if (!pharmacyDispensingLiveFor(scope.hospitalId))
      throw new EmrWriteError("config", "The pharmacy workspace is off for this hospital.");
    const database = db as unknown as EmrDb;
    if (!(await isDemoHospital(database, scope.hospitalId)))
      throw new EmrWriteError("forbidden", "Demo data goes only into a demo hospital.");
    const admin = createServiceClient().auth.admin;
    const { loadId, notes } = await loadPharmacyDemo(
      database,
      { userId: scope.userId, hospitalId: scope.hospitalId },
      {
        makeUser: async (label) => {
          const { data, error } = await admin.createUser({
            email: `pharmacy-demo-${crypto.randomUUID()}@demo.medsync.invalid`,
            email_confirm: true,
            ban_duration: "876000h",
            user_metadata: { full_name: label, medsync_pharmacy_demo: true },
          });
          if (error || !data.user) throw new Error(`Could not create ${label}.`);
          return data.user.id;
        },
      },
    );
    revalidatePath("/pharmacy", "layout");
    revalidatePath("/hospital-admin/departments/pharmacy", "layout");
    const stopped = Object.keys(notes);
    return {
      ok: true,
      id: loadId,
      serverTime: new Date().toISOString(),
      ...(stopped.length ? { warnings: [`Some sections stopped: ${stopped.join(", ")}. See Loads below.`] } : {}),
    };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof EmrWriteError) return actionError(e);
    // Anything else (an account that could not be made, a database refusal) is said on the page, never a crash.
    const message = e instanceof Error ? e.message : String(e);
    logger.error("pharmacy.demo.load_failed", { message: message.slice(0, 300) });
    return { ok: false, code: "config", error: `The demo load stopped: ${message.slice(0, 200)}. See Loads below.` };
  }
}

/**
 * "Remove the pharmacy demo" (owner request, 28 Oct 2026; migration 0260): the hospital admin, a demo hospital only.
 * One transaction deletes every demo row; the SQL function writes the audit row. A second press removes nothing.
 */
export async function removePharmacyDemoAction(): Promise<ActionResult> {
  try {
    const scope = await requireHospitalAdminScope();
    const database = db as unknown as EmrDb;
    if (!(await isDemoHospital(database, scope.hospitalId)))
      throw new EmrWriteError("forbidden", "Demo data is removed only from a demo hospital.");
    await removePharmacyDemo(database, scope.hospitalId, scope.userId);
    revalidatePath("/pharmacy", "layout");
    revalidatePath("/hospital-admin/departments/pharmacy", "layout");
    return { ok: true, id: scope.hospitalId, serverTime: new Date().toISOString() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof EmrWriteError) return actionError(e);
    // A real record pointing at demo data, or a busy table: the transaction rolled back, so nothing went. Drizzle's
    // "Failed query" hides the database's own words in `cause`.
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    const detail = (cause as { detail?: string }).detail;
    const message = (cause instanceof Error ? cause.message : String(cause)) + (detail ? ` (${detail})` : "");
    logger.error("pharmacy.demo.remove_failed", { message: message.slice(0, 300) });
    return { ok: false, code: "config", error: `Nothing was removed: ${message.slice(0, 400)}.` };
  }
}
