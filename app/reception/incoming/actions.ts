"use server";

import type { ReceptionPatientHit } from "@/lib/reception/queries";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { searchPatientsByCode } from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * The Incoming board's writes (PRD MS-PRD-SYM-001 §8.5; ADR 0098). Thin
 * wrappers: the Edge Functions own auth (authoriseAtHospital on the row's
 * facility), the status machine and the audit row; these pin the scope,
 * parse the form and revalidate the boards that show the row.
 * app/nurse/incoming/actions.ts is the same file under requireNurseScope.
 */

export type IncomingActionState = {
  ok?: boolean;
  error?: string;
  /** Arrived: the intake the pre-alert now points at. */
  intakeId?: string;
  /** Arrived: true when the patient already held a live intake today and it was linked, not duplicated. */
  linked?: boolean;
};

const BOARD_PATHS = ["/reception/incoming", "/reception", "/nurse/incoming", "/nurse"];

const UpdateSchema = z
  .object({
    pre_arrival_id: z.string().uuid(),
    status: z.enum(["seen", "ready", "not_arriving", "hoax"]),
    reason: z.string().trim().min(8, "Reason ≥ 8 chars (audited).").max(500).optional(),
  })
  .refine((v) => !!v.reason || (v.status !== "not_arriving" && v.status !== "hoax"), {
    message: "Closing a pre-alert needs a reason of at least 8 characters.",
    path: ["reason"],
  });

const ArrivedSchema = z.object({
  pre_arrival_id: z.string().uuid(),
  patient_user_id: z.string().uuid().optional(),
  patient_unknown_label: z.string().trim().min(1).max(240).optional(),
  receiving_department_id: z.string().uuid().optional(),
  reason: z.string().trim().min(8, "Audit note ≥ 8 chars.").max(500),
});

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Please check the values.";

export async function updatePreArrivalAction(
  _prev: IncomingActionState,
  formData: FormData,
): Promise<IncomingActionState> {
  const parsed = UpdateSchema.safeParse({
    pre_arrival_id: formData.get("pre_arrival_id"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  await requireReceptionScope();
  const result = await callEdge("ha-update-pre-arrival", parsed.data, "reception.incoming");
  if (!result.ok) return { error: result.error };
  for (const p of BOARD_PATHS) revalidatePath(p);
  return { ok: true };
}

export async function markArrivedAction(
  _prev: IncomingActionState,
  formData: FormData,
): Promise<IncomingActionState> {
  const parsed = ArrivedSchema.safeParse({
    pre_arrival_id: formData.get("pre_arrival_id"),
    patient_user_id: formData.get("patient_user_id") || undefined,
    patient_unknown_label: formData.get("patient_unknown_label") || undefined,
    receiving_department_id: formData.get("receiving_department_id") || undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  await requireReceptionScope();
  const result = await callEdge<{ intake_id: string; linked: boolean }>(
    "ha-pre-arrival-arrived",
    parsed.data,
    "reception.incoming",
  );
  if (!result.ok) return { error: result.error };
  for (const p of BOARD_PATHS) revalidatePath(p);
  return { ok: true, intakeId: result.data?.intake_id, linked: result.data?.linked ?? false };
}

/** Code-only patient search for the Arrived dialog — hits carry no name by design. */
export async function searchPatientsAction(query: string): Promise<ReceptionPatientHit[]> {
  const scope = await requireReceptionScope();
  return searchPatientsByCode({ hospitalId: scope.hospitalId, query, limit: 12 });
}
