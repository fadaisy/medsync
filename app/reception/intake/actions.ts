"use server";

import type { RegisterIntakeState } from "../../hospital-admin/intake/actions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireReceptionScope } from "@/lib/reception/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * Reception's parallel intake action. Same shape + Edge Function as
 * the hospital-admin version, but pinned to requireReceptionScope —
 * so a reception user can register an entry without being a hospital
 * admin. The Edge Function (ha-register-intake) auth allows any
 * active staff_affiliation at the hospital, so this works end-to-end.
 */

const RegisterSchema = z.object({
  entry_type_code: z.string().min(1).max(64),
  entry_point: z.string().max(40).optional(),
  receiving_department_id: z.string().uuid().optional(),
  patient_user_id: z.string().uuid().optional(),
  patient_unknown_label: z.string().max(240).optional(),
  appointment_id: z.string().uuid().optional(),
  referring_hospital_id: z.string().uuid().optional(),
  referring_facility_other: z.string().max(240).optional(),
  referring_clinician_name: z.string().max(240).optional(),
  referral_reason: z.string().max(2000).optional(),
  referral_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  presenting_complaint: z.string().max(2000).optional(),
  brought_by: z.string().max(240).optional(),
  priority_hint_override: z.enum(["routine", "high", "urgent"]).optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().min(8, "Audit note ≥ 8 chars.").default("Patient registered at front desk."),
});

export async function receptionRegisterIntakeAction(
  _prev: RegisterIntakeState,
  formData: FormData,
): Promise<RegisterIntakeState> {
  const parsed = RegisterSchema.safeParse({
    entry_type_code: formData.get("entry_type_code"),
    entry_point: stringOrUndef(formData.get("entry_point")),
    receiving_department_id: stringOrUndef(formData.get("receiving_department_id")),
    patient_user_id: stringOrUndef(formData.get("patient_user_id")),
    patient_unknown_label: stringOrUndef(formData.get("patient_unknown_label")),
    appointment_id: stringOrUndef(formData.get("appointment_id")),
    referring_hospital_id: stringOrUndef(formData.get("referring_hospital_id")),
    referring_facility_other: stringOrUndef(formData.get("referring_facility_other")),
    referring_clinician_name: stringOrUndef(formData.get("referring_clinician_name")),
    referral_reason: stringOrUndef(formData.get("referral_reason")),
    referral_date: stringOrUndef(formData.get("referral_date")),
    presenting_complaint: stringOrUndef(formData.get("presenting_complaint")),
    brought_by: stringOrUndef(formData.get("brought_by")),
    priority_hint_override:
      (stringOrUndef(formData.get("priority_hint_override")) as
        | "routine"
        | "high"
        | "urgent"
        | undefined) ?? undefined,
    notes: stringOrUndef(formData.get("notes")),
    reason: stringOrUndef(formData.get("reason")) ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  if (!parsed.data.patient_user_id && !parsed.data.patient_unknown_label) {
    return {
      error:
        "Either pick a known patient or enter an unknown-patient label (e.g. 'Unknown male brought by police').",
    };
  }

  const scope = await requireReceptionScope();
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ha-register-intake`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        hospital_id: scope.hospitalId,
        ...parsed.data,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const p = JSON.parse(text) as { error?: string | { message?: string } };
        if (typeof p.error === "string") detail = p.error;
        else if (p.error?.message) detail = p.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn("reception.intake.register.failed", { status: res.status });
      return { error: detail || `Edge Function returned ${res.status}.` };
    }
    const payload = JSON.parse(text) as {
      data?: { intake_id?: string; is_emergency?: boolean };
    };
    revalidatePath("/reception");
    revalidatePath("/reception/intake");
    revalidatePath("/reception/flow");
    revalidatePath("/nurse");
    revalidatePath("/doctor");
    return {
      ok: true,
      intakeId: payload.data?.intake_id,
      isEmergency: payload.data?.is_emergency,
    };
  } catch (e) {
    logger.error("reception.intake.register.network", { reason: String(e) });
    return { error: "Couldn't reach the intake service." };
  }
}

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}
