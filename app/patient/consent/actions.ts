"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { consentRecords } from "@/db/schema/consent-records";
import { logger } from "@/lib/logger";
import { dataProcessingConsent, resolvePatientScope } from "@/lib/patient/scope";

/** `field` names the control at fault; a server-side failure names none, and paints nothing red. */
export type AcceptConsentState = { error?: string; field?: "consent" };

const Args = z.object({
  data_processing_consent: z.literal("on", { message: "Tick the box to continue." }),
  data_processing_consent_version: z.string().min(1),
  data_processing_consent_body_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

/**
 * Re-accept the data-processing notice (Gate H, ADR 0094). The write is the
 * patient signup's, step for step: the posted version + hash must match the
 * ACTIVE `consent_versions` row (a stale page is refused, never recorded
 * under a different text), then one `consent_records` row — the DPPA 2019
 * proof. `resolvePatientScope`, not `require`: the gate this action opens
 * would otherwise send it back here.
 */
export async function acceptDataProcessingConsentAction(
  _prev: AcceptConsentState,
  formData: FormData,
): Promise<AcceptConsentState> {
  const parsed = Args.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Tick the box to continue.", field: "consent" };
  const scope = await resolvePatientScope();

  const active = await dataProcessingConsent(scope.userId);
  if (!active) return { error: "The consent text isn't ready yet. Please check back shortly." };
  if (
    active.version !== parsed.data.data_processing_consent_version ||
    active.bodySha256.toLowerCase() !==
      parsed.data.data_processing_consent_body_sha256.toLowerCase()
  ) {
    logger.warn("patient.consent.stale_version", { version: active.version });
    return {
      error:
        "The consent text has been updated. Please reload the page, re-read, and accept the new version.",
    };
  }

  if (active.acceptedAt === null) {
    try {
      await db.insert(consentRecords).values({
        userId: scope.userId,
        consentType: "data_processing",
        version: active.version,
        consentTextSha256: active.bodySha256,
        acceptedAt: new Date(),
      });
    } catch (e) {
      logger.error("patient.consent.insert_failed", { reason: String(e) });
      return { error: "Could not save that. Try again." };
    }
  }
  redirect("/patient");
}
