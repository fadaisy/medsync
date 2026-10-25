"use server";

import type { DayMood } from "@patient-core/log";
import { revalidatePath } from "next/cache";
import { MOOD_VALUE } from "@patient-core/log";

import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * Home's writes, the phone's own (`mobile/src/data/medicines.ts` take/undo, `mood.ts` pick): plain inserts and
 * deletes on the patient's own rows under RLS (migration 0029 `self_medication_takes_*_own`; mood is kind
 * 'mood', migration 0170). A take carries its own id, so Undo removes exactly that row. Revalidating the
 * layout refreshes the cascade, the rail's Care badge and the plus together (S5).
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/pw/patient", "layout");
  revalidatePath("/patient", "layout");
}

export async function takeDoseAction(
  medicationId: string,
  scheduledForIso: string | null,
): Promise<Result<{ takeId: string }>> {
  if (!medicationId) return { ok: false, error: PATIENT_WEB_COPY.offline };
  const slot = scheduledForIso ? new Date(scheduledForIso) : null;
  if (slot && Number.isNaN(slot.getTime())) return { ok: false, error: PATIENT_WEB_COPY.offline };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("self_medication_takes").insert({
    id,
    medication_id: medicationId,
    patient_user_id: scope.userId,
    scheduled_for: slot ? slot.toISOString() : null,
    taken_at: new Date().toISOString(),
  });
  if (error) {
    logger.warn("patient-web.take_failed", { reason: error.message });
    return { ok: false, error: "Couldn't record that — try again." };
  }
  refresh();
  return { ok: true, takeId: id };
}

export async function undoTakeAction(takeId: string): Promise<Result> {
  if (!takeId) return { ok: false, error: "Couldn't undo that. Try again later." };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase
    .from("self_medication_takes")
    .delete()
    .eq("id", takeId)
    .eq("patient_user_id", scope.userId);
  if (error) {
    logger.warn("patient-web.undo_take_failed", { reason: error.message });
    return { ok: false, error: "Couldn't undo that. Try again later." };
  }
  refresh();
  return { ok: true };
}

export async function saveMoodAction(mood: DayMood): Promise<Result> {
  const value = MOOD_VALUE[mood];
  if (!value) return { ok: false, error: PATIENT_WEB_COPY.offline };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase.from("personal_health_logs").insert({
    patient_user_id: scope.userId,
    kind: "mood",
    recorded_at: new Date().toISOString(),
    numeric_value_1: value,
  });
  if (error) {
    logger.warn("patient-web.mood_failed", { reason: error.message });
    return { ok: false, error: "Couldn't save that — try again in a moment." };
  }
  refresh();
  return { ok: true };
}
