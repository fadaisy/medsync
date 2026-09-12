"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { READING_KINDS } from "@/lib/patient/self-tracking-constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for patient self-tracking. All writes use the
 * user-context Supabase client so RLS (`patient_user_id = auth.uid()`)
 * enforces ownership. No Edge Function needed — this is patient-private
 * data the patient owns end-to-end.
 */

/* ─── Log a reading ────────────────────────────────────────────── */

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
  revalidatePath("/patient/track/doses");
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
  revalidatePath("/patient/track/doses");
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

/**
 * One dose time on a 24-hour clock. A native `<input type="time">` hands back
 * "HH:MM", but a `step` attribute can make it "HH:MM:SS" — trim to the minute
 * rather than reject something the patient entered correctly.
 */
const ScheduleTimeSchema = z
  .string()
  .transform((v) => v.trim().slice(0, 5))
  .refine((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use 24-hour times like 08:00.");

const ScheduleTimesSchema = z.array(ScheduleTimeSchema).max(6, "Up to 6 times a day.");

const AddMedSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  dose: z.string().max(60).optional(),
  instructions: z.string().max(240).optional(),
  schedule_pattern: z.enum(SCHEDULE_PATTERNS).default("as_needed"),
  schedule_times: ScheduleTimesSchema.optional(),
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
    schedule_times: stringsOrUndef(formData.getAll("schedule_times")),
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
    schedule_times: scheduleTimesForWrite(parsed.data.schedule_times),
    notes: parsed.data.notes ?? null,
  });

  if (error) {
    logger.warn("patient.track.add_med_failed", { reason: error.message });
    return { error: "Couldn't save that — try again in a moment." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/doses");
  revalidatePath("/patient/track/medications");
  return { ok: true };
}

/* ─── Set the dose times on an existing medication ─────────────── */

/**
 * Backfill path. Every medication written before dose times existed has
 * `schedule_times = NULL`, and a null-timed medication is invisible to the
 * dose timeline — so without this the timeline would only ever show rows
 * created after the add-form learned the field.
 */
export async function setMedicationTimesAction(
  medicationId: string,
  times: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!medicationId) return { ok: false, error: "Missing medication id." };

  const parsed = ScheduleTimesSchema.safeParse(times);
  if (!parsed.success) {
    const first = parsed.error.issues.map((i) => i.message).find(Boolean);
    return { ok: false, error: first ?? "Please check the times." };
  }

  const scope = await requirePatientScope();
  const supabase = await createClient();

  // `patient_user_id` is the ownership check RLS also enforces; keeping it in
  // the statement means a mismatched id updates nothing rather than erroring.
  const { error } = await supabase
    .from("self_medications")
    .update({ schedule_times: scheduleTimesForWrite(parsed.data) })
    .eq("id", medicationId)
    .eq("patient_user_id", scope.userId);

  if (error) {
    logger.warn("patient.track.set_med_times_failed", { reason: error.message });
    return { ok: false, error: "Couldn't save those times — try again." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/doses");
  revalidatePath("/patient/track/medications");
  return { ok: true };
}

/* ─── Mark a med as taken (today, now) ─────────────────────────── */

/**
 * `scheduledForIso` names the slot this take belongs to. Given it, dose
 * attribution is recorded rather than inferred later by nearest-time guessing
 * — which is what keeps a dose taken late from reading as a missed one.
 * Omitted (an off-schedule or as-needed dose), the column stays null.
 */
export async function markMedicationTakenAction(
  medicationId: string,
  scheduledForIso?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!medicationId) return { ok: false, error: "Missing medication id." };

  let scheduledFor: string | null = null;
  if (scheduledForIso) {
    const slot = new Date(scheduledForIso);
    if (Number.isNaN(slot.getTime())) return { ok: false, error: "Invalid dose time." };
    scheduledFor = slot.toISOString();
  }

  const scope = await requirePatientScope();
  const supabase = await createClient();

  const { error } = await supabase.from("self_medication_takes").insert({
    medication_id: medicationId,
    patient_user_id: scope.userId,
    scheduled_for: scheduledFor,
    taken_at: new Date().toISOString(),
  });

  if (error) {
    logger.warn("patient.track.mark_taken_failed", { reason: error.message });
    return { ok: false, error: "Couldn't record that — try again." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/doses");
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
  revalidatePath("/patient/track/doses");
  revalidatePath("/patient/track/medications");
  return { ok: true };
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Repeated form fields (the dose-time inputs), blanks dropped. */
function stringsOrUndef(values: FormDataEntryValue[]): string[] | undefined {
  const list = values.flatMap((v) => (typeof v === "string" && v.trim() ? [v.trim()] : []));
  return list.length ? list : undefined;
}

/**
 * PostgREST casts a JSON string array straight into a `time[]` column, so
 * ["08:00","20:00"] needs no array literal or quoting — the plain array is the
 * wire format. An empty selection writes NULL rather than `{}`: "no times set"
 * is one state, and a zero-length array would be a second way to say it that
 * every reader would then have to test for.
 */
function scheduleTimesForWrite(times: readonly string[] | undefined): string[] | null {
  if (!times?.length) return null;
  return [...new Set(times)].sort(); // zero-padded HH:MM sorts lexicographically
}
