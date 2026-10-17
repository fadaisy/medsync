"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { askForCopy, viewerKind } from "@/lib/lab/patient-results";
import { logger } from "@/lib/logger";
import { fetchSmsConsentVersion, setSmsConsent } from "@/lib/notifications/consent";
import { requirePatientScope } from "@/lib/patient/scope";

type Result = { ok: true } | { ok: false; error: string };

/**
 * PR-12: "Show my results in the app", a separate, recorded, withdrawable choice against the signed notice. A
 * guardian makes it for a linked child. Withdrawal hides results at once (the gate reads it on every request).
 */
export async function setResultsConsentAction(raw: unknown): Promise<Result> {
  const p = z.object({ on: z.boolean(), subject: z.uuid() }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Invalid input." };
  const scope = await requirePatientScope();
  if (!(await viewerKind({ userId: scope.userId, subjectUserId: p.data.subject })))
    return { ok: false, error: "That record is not yours to change." };
  const version = await fetchSmsConsentVersion("results_in_app");
  if (!version) return { ok: false, error: "Results in the app are not available yet." };
  const h = await headers();
  try {
    await setSmsConsent(
      p.data.subject,
      p.data.on,
      version,
      { ip: null, userAgent: h.get("user-agent") },
      "results_in_app",
    );
  } catch (e) {
    logger.error("patient.results.consent.failed", { reason: String(e) });
    return { ok: false, error: "Could not save that. Try again." };
  }
  revalidatePath("/patient/results");
  return { ok: true };
}

/** PR-15: "Ask for a copy of all my results" (the records office fulfils it; a hold never blocks it). */
export async function askForCopyAction(raw: unknown): Promise<Result> {
  const p = z.object({ clientKey: z.string().min(8).max(120) }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Invalid input." };
  const scope = await requirePatientScope();
  const n = await askForCopy(scope.userId, p.data.clientKey, new Date());
  return n
    ? { ok: true }
    : { ok: false, error: "There are no lab results on your record to copy yet." };
}
