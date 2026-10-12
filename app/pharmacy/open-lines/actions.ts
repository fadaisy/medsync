"use server";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { REVIEW } from "@/content/pharmacy-review";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { InStockInput, notifyOwedInStock as notify } from "@/lib/pharmacy/notify";
import { patientListLive } from "@/lib/pharmacy/patient-list";
import { smsSender } from "@/lib/pharmacy/sms-sender";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * `notifyOwedInStock` (Section 8: Messages; 5.7, MS-4): "Tell the patient it is here". A person's press
 * only, `pharmacy.dispense` at a live point, only while the medicine is on the shelf there. Zod with a
 * client key (the notice's id) → the actor → the flags → one transaction. The message's fate comes back in
 * words (`message`); a message failure never throws (MS-5).
 */
export async function notifyOwedInStock(
  raw: unknown,
): Promise<ActionResult & { message?: string }> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyDispensingLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: REVIEW.refused.flagOff };
    if (!(await patientListLive(actor.hospitalId)))
      return { ok: false, code: "config", error: REVIEW.message.why.not_signed };
    const production = process.env.VERCEL_ENV === "production";
    const r = await runPharmacyWrite(
      InStockInput,
      raw,
      actor,
      { permission: "pharmacy.dispense", point: "live" },
      (ctx, input) => notify(ctx, input, smsSender(), production),
    );
    if (!r.ok) return r;
    revalidatePath("/pharmacy/open-lines");
    return { ok: true, id: r.id, serverTime: r.serverTime, message: r.data?.notice.words };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.messages.action_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, code: "conflict", error: REVIEW.refused.failed };
  }
}
