"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for patient self-tracking. All writes use the
 * user-context Supabase client so RLS (`patient_user_id = auth.uid()`)
 * enforces ownership. No Edge Function needed — this is patient-private
 * data the patient owns end-to-end.
 */

/* ─── Log a reading ────────────────────────────────────────────── */

const READING_KINDS = [
  "glucose",
  "bp",
  "weight",
  "spo2",
  "temperature",
  "symptom",
  "note",
  "other",
] as const;

const LogReadingSchema = z
  .object({
    kind: z.enum(READING_KINDS),
    numeric_value_1: z.string().optional(),
    numeric_value_2: z.string().optional(),
    unit: z.string().max(16).optional(),
    severity: z.string().optional(),
    note: z.string().max(2000).optional(),
    // ISO local "YYYY-MM-DDTHH:mm" from <input type=datetime-local> — optional
    recorded_at: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "bp") {
      if (!val.numeric_value_1 || !val.numeric_value_2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter both systolic and diastolic.",
          path: ["numeric_value_1"],
        });
      }
    } else if (val.kind !== "note" && val.kind !== "symptom" && val.kind !== "other") {
      if (!val.numeric_value_1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a value.",
          path: ["numeric_value_1"],
        });
      }
    } else if (val.kind === "note" && !val.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Write something to remember.",
        path: ["note"],
      });
    }
  });

export type LogReadingState = { ok?: boolean; error?: string };

export async function logReadingAction(
  _prev: LogReadingState,
  formData: FormData,
): Promise<LogReadingState> {
  const parsed = LogReadingSchema.safeParse({
    kind: formData.get("kind"),
    numeric_value_1: stringOrUndef(formData.get("numeric_value_1")),
    numeric_value_2: stringOrUndef(formData.get("numeric_value_2")),
    unit: stringOrUndef(formData.get("unit")),
    severity: stringOrUndef(formData.get("severity")),
    note: stringOrUndef(formData.get("note")),
    recorded_at: stringOrUndef(formData.get("recorded_at")),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requirePatientScope();
  const supabase = await createClient();

  const recordedAt = parsed.data.recorded_at
    ? new Date(parsed.data.recorded_at).toISOString()
    : new Date().toISOString();

  const severityNum = parsed.data.severity ? Number(parsed.data.severity) : null;
  if (severityNum !== null && (Number.isNaN(severityNum) || severityNum < 1 || severityNum > 5)) {
    return { error: "Severity must be 1–5." };
  }

  const { error } = await supabase.from("personal_health_logs").insert({
    patient_user_id: scope.userId,
    kind: parsed.data.kind,
    recorded_at: recordedAt,
    numeric_value_1: parsed.data.numeric_value_1 ?? null,
    numeric_value_2: parsed.data.numeric_value_2 ?? null,
    unit: parsed.data.unit ?? null,
    severity: severityNum,
    note: parsed.data.note ?? null,
  });

  if (error) {
    logger.warn("patient.track.log_reading_failed", { reason: error.message });
    return { error: "Couldn't save that — try again in a moment." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  return { ok: true };
}

/* ─── Soft-delete a reading ────────────────────────────────────── */

export async function deleteReadingAction(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "Missing reading id." };

  const scope = await requirePatientScope();
  const supabase = await createClient();

  const { error } = await supabase
    .from("personal_health_logs")
    .update({ state: "deleted" })
    .eq("id", id)
    .eq("patient_user_id", scope.userId);

  if (error) {
    logger.warn("patient.track.delete_reading_failed", { reason: error.message });
    return { ok: false, error: "Couldn't remove that reading." };
  }
  revalidatePath("/patient");
  revalidatePath("/patient/track");
  return { ok: true };
}

/* ─── Add a self-medication ────────────────────────────────────── */

const SCHEDULE_PATTERNS = [
  "as_needed",
  "once_daily",
  "twice_daily",
  "thrice_daily",
  "custom",
] as const;

const AddMedSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  dose: z.string().max(60).optional(),
  instructions: z.string().max(240).optional(),
  schedule_pattern: z.enum(SCHEDULE_PATTERNS).default("as_needed"),
  notes: z.string().max(2000).optional(),
});

export type AddMedState = { ok?: boolean; error?: string };

export async function addMedicationAction(
  _prev: AddMedState,
  formData: FormData,
): Promise<AddMedState> {
  const parsed = AddMedSchema.safeParse({
    name: formData.get("name"),
    dose: stringOrUndef(formData.get("dose")),
    instructions: stringOrUndef(formData.get("instructions")),
    schedule_pattern: formData.get("schedule_pattern") ?? "as_needed",
    notes: stringOrUndef(formData.get("notes")),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const scope = await requirePatientScope();
  const supabase = await createClient();

  const { error } = await supabase.from("self_medications").insert({
    patient_user_id: scope.userId,
    name: parsed.data.name.trim(),
    dose: parsed.data.dose ?? null,
    instructions: parsed.data.instructions ?? null,
    schedule_pattern: parsed.data.schedule_pattern,
    notes: parsed.data.notes ?? null,
  });

  if (error) {
    logger.warn("patient.track.add_med_failed", { reason: error.message });
    return { error: "Couldn't save that — try again in a moment." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/medications");
  return { ok: true };
}

/* ─── Mark a med as taken (today, now) ─────────────────────────── */

export async function markMedicationTakenAction(
  medicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!medicationId) return { ok: false, error: "Missing medication id." };

  const scope = await requirePatientScope();
  const supabase = await createClient();

  const { error } = await supabase.from("self_medication_takes").insert({
    medication_id: medicationId,
    patient_user_id: scope.userId,
    taken_at: new Date().toISOString(),
  });

  if (error) {
    logger.warn("patient.track.mark_taken_failed", { reason: error.message });
    return { ok: false, error: "Couldn't record that — try again." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/medications");
  return { ok: true };
}

/* ─── Stop / pause a medication ────────────────────────────────── */

const MED_STATES = ["active", "paused", "ended"] as const;

export async function setMedicationStateAction(
  medicationId: string,
  state: (typeof MED_STATES)[number],
): Promise<{ ok: boolean; error?: string }> {
  if (!medicationId) return { ok: false, error: "Missing medication id." };
  if (!MED_STATES.includes(state)) return { ok: false, error: "Invalid state." };

  const scope = await requirePatientScope();
  const supabase = await createClient();

  const update: { state: string; ended_on?: string } = { state };
  if (state === "ended") {
    update.ended_on = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from("self_medications")
    .update(update)
    .eq("id", medicationId)
    .eq("patient_user_id", scope.userId);

  if (error) {
    logger.warn("patient.track.set_med_state_failed", { reason: error.message });
    return { ok: false, error: "Couldn't update that medication." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/medications");
  return { ok: true };
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}
