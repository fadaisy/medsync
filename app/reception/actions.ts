"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireReceptionScope } from "@/lib/reception/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * Reception server actions. Thin wrappers around the Edge Functions
 * (ha-check-in-patient, ha-cancel-intake). The Edge Functions own
 * auth + audit; these wrappers handle scope-pin + form parsing +
 * revalidation.
 */

export type ReceptionActionState = { ok?: boolean; error?: string };

async function callEdge(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: string | { message?: string } };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn(`reception.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    return { ok: true, data: text ? JSON.parse(text) : {} };
  } catch (e) {
    logger.error(`reception.${name}.network`, { reason: String(e) });
    return { ok: false, error: `Couldn't reach ${name}.` };
  }
}

/* ─── Check-in a booked patient ─────────────────────────────────── */

const CheckInSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z
    .string()
    .min(8, "Reason ≥ 8 chars (audited).")
    .default("Booked patient checked in at front desk."),
});

export async function checkInPatientAction(
  _prev: ReceptionActionState,
  formData: FormData,
): Promise<ReceptionActionState> {
  const parsed = CheckInSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  await requireReceptionScope();
  const result = await callEdge("ha-check-in-patient", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/reception");
  revalidatePath("/reception/expected");
  revalidatePath("/reception/flow");
  return { ok: true };
}

/* ─── Cancel an intake ──────────────────────────────────────────── */

const CancelIntakeSchema = z.object({
  intake_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited)."),
});

export async function cancelIntakeAction(
  _prev: ReceptionActionState,
  formData: FormData,
): Promise<ReceptionActionState> {
  const parsed = CancelIntakeSchema.safeParse({
    intake_id: formData.get("intake_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  await requireReceptionScope();
  const result = await callEdge("ha-cancel-intake", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/reception");
  revalidatePath("/reception/flow");
  return { ok: true };
}
