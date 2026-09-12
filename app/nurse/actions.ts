"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireNurseScope } from "@/lib/nurse/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Nurse workspace server actions. Thin wrappers around the four
 * Edge Functions (record-observation, administer-medication,
 * submit-handover, assign-patient-to-nurse). The Edge Functions own
 * cadre + cosign enforcement and audit; these wrappers handle
 * scope-pin + form parsing + revalidation.
 */

export type NurseActionState = {
  ok?: boolean;
  error?: string;
  /** When the action queued a cosign request, the UI shows a different
   * confirmation. */
  queuedForReview?: boolean;
};

/* ─── Observations ──────────────────────────────────────────────── */

const ObservationSchema = z.object({
  patient_user_id: z.string().uuid(),
  observation_kind: z.enum([
    "bp",
    "hr",
    "temperature",
    "rr",
    "spo2",
    "glucose",
    "pain",
    "weight",
    "height",
    "intake",
    "output",
    "gcs",
    "other",
  ]),
  numeric_value_1: z.string().optional(),
  numeric_value_2: z.string().optional(),
  unit: z.string().max(16).optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited).").default("Bedside observation."),
});

export async function recordObservationAction(
  _prev: NurseActionState,
  formData: FormData,
): Promise<NurseActionState> {
  const parsed = ObservationSchema.safeParse({
    patient_user_id: formData.get("patient_user_id"),
    observation_kind: formData.get("observation_kind"),
    numeric_value_1: stringOrUndef(formData.get("numeric_value_1")),
    numeric_value_2: stringOrUndef(formData.get("numeric_value_2")),
    unit: stringOrUndef(formData.get("unit")),
    notes: stringOrUndef(formData.get("notes")),
    reason: stringOrUndef(formData.get("reason")) ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requireNurseScope();

  const numeric1 = parsed.data.numeric_value_1 ? Number(parsed.data.numeric_value_1) : undefined;
  const numeric2 = parsed.data.numeric_value_2 ? Number(parsed.data.numeric_value_2) : undefined;
  if (numeric1 !== undefined && Number.isNaN(numeric1)) {
    return { error: "Value 1 must be a number." };
  }
  if (numeric2 !== undefined && Number.isNaN(numeric2)) {
    return { error: "Value 2 must be a number." };
  }

  const result = await callEdge(
    "ha-record-observation",
    {
      hospital_id: scope.hospitalId,
      patient_user_id: parsed.data.patient_user_id,
      observation_kind: parsed.data.observation_kind,
      numeric_value_1: numeric1,
      numeric_value_2: numeric2,
      unit: parsed.data.unit,
      notes: parsed.data.notes,
      reason: parsed.data.reason,
    },
    "nurse",
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/nurse");
  revalidatePath("/nurse/patients");
  revalidatePath(`/nurse/patients/${parsed.data.patient_user_id}`);
  return { ok: true };
}

/* ─── Medication administration ─────────────────────────────────── */

const MarSchema = z.object({
  patient_user_id: z.string().uuid(),
  drug_name: z.string().min(1).max(240),
  dose: z.string().min(1).max(120),
  route: z.enum(["oral", "iv", "im", "sc", "topical", "inhaled", "pr", "other"]),
  is_high_alert: z.boolean().optional().default(false),
  state: z.enum(["administered", "withheld", "refused", "wasted"]),
  withheld_reason: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  prescription_id: z.string().max(120).optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited).").default("Medication administration."),
});

export async function administerMedicationAction(
  _prev: NurseActionState,
  formData: FormData,
): Promise<NurseActionState> {
  const parsed = MarSchema.safeParse({
    patient_user_id: formData.get("patient_user_id"),
    drug_name: formData.get("drug_name"),
    dose: formData.get("dose"),
    route: formData.get("route"),
    is_high_alert: formData.get("is_high_alert") === "true",
    state: formData.get("state") ?? "administered",
    withheld_reason: stringOrUndef(formData.get("withheld_reason")),
    notes: stringOrUndef(formData.get("notes")),
    prescription_id: stringOrUndef(formData.get("prescription_id")),
    reason: stringOrUndef(formData.get("reason")) ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requireNurseScope();

  const result = await callEdge(
    "ha-administer-medication",
    {
      hospital_id: scope.hospitalId,
      patient_user_id: parsed.data.patient_user_id,
      drug_name: parsed.data.drug_name,
      dose: parsed.data.dose,
      route: parsed.data.route,
      is_high_alert: parsed.data.is_high_alert,
      state: parsed.data.state,
      withheld_reason: parsed.data.withheld_reason,
      notes: parsed.data.notes,
      prescription_id: parsed.data.prescription_id,
      reason: parsed.data.reason,
    },
    "nurse",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/nurse");
  revalidatePath("/nurse/patients");
  revalidatePath(`/nurse/patients/${parsed.data.patient_user_id}`);

  const data = (result.data ?? {}) as { data?: { queued_for_review?: boolean } } & {
    queued_for_review?: boolean;
  };
  const queued = data.data?.queued_for_review ?? data.queued_for_review ?? false;
  return { ok: true, queuedForReview: queued };
}

/* ─── Shift handover ────────────────────────────────────────────── */

const HandoverSchema = z.object({
  ward_id: z.string().uuid(),
  shift_label: z.enum(["day", "evening", "night", "custom"]),
  summary: z.string().min(8, "Tell the next shift what they need to know.").max(8000),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited).").default("Shift handover submitted."),
});

export async function submitHandoverAction(
  _prev: NurseActionState,
  formData: FormData,
): Promise<NurseActionState> {
  const parsed = HandoverSchema.safeParse({
    ward_id: formData.get("ward_id"),
    shift_label: formData.get("shift_label") ?? "day",
    summary: formData.get("summary"),
    reason: stringOrUndef(formData.get("reason")) ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requireNurseScope();
  const result = await callEdge(
    "ha-submit-handover",
    {
      hospital_id: scope.hospitalId,
      ward_id: parsed.data.ward_id,
      shift_label: parsed.data.shift_label,
      summary: parsed.data.summary,
      reason: parsed.data.reason,
    },
    "nurse",
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/nurse/handover");
  return { ok: true };
}

/* ─── Assignment board ──────────────────────────────────────────── */

const AssignSchema = z.object({
  nurse_user_id: z.string().uuid(),
  patient_user_id: z.string().uuid(),
  ward_id: z.string().uuid().optional(),
  relationship_kind: z.enum(["primary", "cover"]).optional().default("primary"),
  reason: z.string().min(8, "Reason ≥ 8 chars (audited).").default("Assigned for today's shift."),
});

export async function assignPatientToNurseAction(
  _prev: NurseActionState,
  formData: FormData,
): Promise<NurseActionState> {
  const parsed = AssignSchema.safeParse({
    nurse_user_id: formData.get("nurse_user_id"),
    patient_user_id: formData.get("patient_user_id"),
    ward_id: stringOrUndef(formData.get("ward_id")),
    relationship_kind: formData.get("relationship_kind") ?? "primary",
    reason: stringOrUndef(formData.get("reason")) ?? undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  const scope = await requireNurseScope();
  const result = await callEdge(
    "ha-assign-patient-to-nurse",
    {
      hospital_id: scope.hospitalId,
      department_id: scope.departmentId,
      ward_id: parsed.data.ward_id ?? null,
      nurse_user_id: parsed.data.nurse_user_id,
      patient_user_id: parsed.data.patient_user_id,
      relationship_kind: parsed.data.relationship_kind,
      reason: parsed.data.reason,
    },
    "nurse",
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/nurse/assignments");
  revalidatePath("/nurse/patients");
  return { ok: true };
}

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}
