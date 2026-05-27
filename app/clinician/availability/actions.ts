"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicianScope } from "@/lib/clinician/scope";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions for the clinician availability editor.
 *
 * Same shape as the hospital-admin staff actions: parse, resolve scope
 * server-side (no client-passed clinician_id / hospital_id is trusted),
 * forward to the Edge Function with the caller's JWT, revalidate.
 *
 * The Edge Function does its own scope check — these actions only add
 * the "translate client form into a typed request and pin hospital_id
 * to the current scope" layer.
 */

const Iso = z.string().datetime({ offset: true });
const Kind = z.enum(["bookable", "teaching", "ward_round", "admin", "leave", "unavailable"]);
const Recurrence = z.enum(["none", "weekly"]);

const SetBlockArgs = z.object({
  block_id: z.string().uuid().optional(),
  kind: Kind,
  starts_at: Iso,
  ends_at: Iso,
  recurrence: Recurrence,
  recurrence_weekday: z.number().int().min(1).max(7).nullable().optional(),
  recurrence_until: Iso.nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

const CancelBlockArgs = z.object({
  block_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

const SettingsArgs = z.object({
  auto_confirm: z.boolean(),
  default_slot_minutes: z.number().int().min(5).max(240),
  buffer_minutes: z.number().int().min(0).max(60),
  allow_virtual: z.boolean(),
  allow_out_of_hours_override: z.boolean(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

export type ActionState = { ok?: boolean; error?: string };

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    if (!res.ok) {
      let detail = await res.text();
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } | string };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn(`clinician.availability.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`clinician.availability.${name}.network`, { reason: String(e) });
    return {
      ok: false,
      error: `Couldn't reach the ${name} service. If you're in local dev, deploy the Edge Function.`,
    };
  }
}

export async function setAvailabilityBlockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const blockId = formData.get("block_id");
  const raw = {
    block_id: typeof blockId === "string" && blockId.length > 0 ? blockId : undefined,
    kind: formData.get("kind"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    recurrence: formData.get("recurrence") ?? "none",
    recurrence_weekday: formData.get("recurrence_weekday")
      ? Number(formData.get("recurrence_weekday"))
      : null,
    recurrence_until: (formData.get("recurrence_until") as string) || null,
    location: (formData.get("location") as string) || null,
    notes: (formData.get("notes") as string) || null,
    reason: formData.get("reason"),
  };
  const parsed = SetBlockArgs.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const first = Object.values(fe).flat().find(Boolean);
    return { error: first ?? "Invalid input." };
  }

  const scope = await requireClinicianScope();
  const result = await callEdgeFunction("ha-set-clinician-availability", {
    ...parsed.data,
    hospital_id: scope.hospitalId,
    clinician_user_id: scope.userId,
    department_id: scope.departmentId,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinician/availability");
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

export async function cancelAvailabilityBlockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = CancelBlockArgs.safeParse({
    block_id: formData.get("block_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  await requireClinicianScope();
  const result = await callEdgeFunction("ha-cancel-clinician-availability", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinician/availability");
  revalidatePath("/doctor/schedule");
  return { ok: true };
}

export async function setClinicianSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    auto_confirm: formData.get("auto_confirm") === "on",
    default_slot_minutes: Number(formData.get("default_slot_minutes")),
    buffer_minutes: Number(formData.get("buffer_minutes")),
    allow_virtual: formData.get("allow_virtual") === "on",
    allow_out_of_hours_override: formData.get("allow_out_of_hours_override") === "on",
    reason: formData.get("reason"),
  };
  const parsed = SettingsArgs.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const first = Object.values(fe).flat().find(Boolean);
    return { error: first ?? "Invalid input." };
  }
  const scope = await requireClinicianScope();
  const result = await callEdgeFunction("ha-set-clinician-settings", {
    ...parsed.data,
    hospital_id: scope.hospitalId,
    clinician_user_id: scope.userId,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinician/availability");
  revalidatePath("/doctor/schedule");
  return { ok: true };
}
