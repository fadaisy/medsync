"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { fetchSmsConsentVersion, setSmsConsent } from "@/lib/notifications/consent";
import { requirePatientScope } from "@/lib/patient/scope";

export type SmsConsentActionState = { ok?: boolean; on?: boolean; error?: string };

const Args = z.object({ on: z.enum(["true", "false"]) });

/**
 * Turn SMS about bookings on or off (Gate E, ADR 0090; PRD §5.2). Granting
 * records the live `sms_communication` text; withdrawing stamps
 * `revoked_at`. Either way the dispatcher reads the result on its next run.
 */
export async function setSmsConsentAction(
  _prev: SmsConsentActionState,
  formData: FormData,
): Promise<SmsConsentActionState> {
  const parsed = Args.safeParse({ on: formData.get("on") });
  if (!parsed.success) return { error: "Invalid input." };
  const on = parsed.data.on === "true";
  const scope = await requirePatientScope();

  const version = await fetchSmsConsentVersion();
  if (!version) return { error: "SMS settings are not available yet." };

  const h = await headers();
  try {
    await setSmsConsent(scope.userId, on, version, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    });
  } catch (e) {
    logger.error("patient.settings.sms_consent.failed", { reason: String(e) });
    return { error: "Could not save that. Try again." };
  }
  revalidatePath("/patient/settings");
  return { ok: true, on };
}
