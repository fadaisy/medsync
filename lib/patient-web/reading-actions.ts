"use server";

import type { SavedReading } from "@/lib/patient-web/readings";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { careModeOn } from "@/lib/patient-web/flags";
import { readingToRow, rowToReading } from "@/lib/patient-web/readings";
import { requirePatientScope } from "@/lib/patient/scope";
import { listRecentReadings } from "@/lib/patient/self-tracking";
import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";

/**
 * Log a reading from the web: the same row the phone inserts (`addLog`, ADR 0342) through the patient's own
 * Supabase client, so RLS (`patient_user_id = auth.uid()`) owns it. Not `logReadingAction`: its kind list has
 * no `pulse` (migration 0170), and the phone's row carries the sugar context and feelings in the note.
 */

const n = z.number().positive().max(1000).nullable();
const Input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bp"), top: n, bottom: n }),
  z.object({
    kind: z.literal("sugar"),
    value: n,
    context: z.enum(["fasting", "lunch", "supper", "after", "bedtime", "random"]),
  }),
  z.object({ kind: z.literal("weight"), value: n }),
  z.object({ kind: z.literal("pulse"), value: n }),
]);
const Feel = z.array(z.enum(["fine", "dizzy", "head", "tired", "chest"])).max(5);

export type SaveReadingResult = { ok: true } | { ok: false; error: string };

export async function saveReadingAction(input: unknown, feel: unknown): Promise<SaveReadingResult> {
  const parsed = Input.safeParse(input);
  const feelings = Feel.safeParse(feel);
  if (!parsed.success || !feelings.success) return { ok: false, error: "Please check the values." };
  const row = readingToRow(parsed.data, feelings.data);
  if (row.v1 === null || (row.kind === "bp" && row.v2 === null))
    return { ok: false, error: "Please check the values." };

  const scope = await requirePatientScope();
  const supabase = await createClient();
  // Care mode v2 (Step 9): the row carries a client key, and the same key goes to `pt-care-reading`, which finds
  // this row and tells the care team when it is a danger reading (S19). One row either way (S18).
  const care = careModeOn();
  const clientKey = care ? crypto.randomUUID() : null;
  const { error } = await supabase.from("personal_health_logs").insert({
    ...(clientKey ? { id: clientKey, client_key: clientKey } : {}),
    patient_user_id: scope.userId,
    kind: row.kind,
    recorded_at: new Date().toISOString(),
    numeric_value_1: row.v1,
    numeric_value_2: row.v2,
    unit: row.unit,
    note: row.note,
  });
  if (error) {
    logger.warn("patient_web.reading.save_failed", { reason: error.message });
    return { ok: false, error: "Couldn't save that. Try again later." };
  }
  if (clientKey) {
    const d = parsed.data;
    const recordedAt = new Date().toISOString();
    const body =
      d.kind === "bp"
        ? { kind: "bp", clientKey, top: d.top, bottom: d.bottom, recordedAt }
        : d.kind === "sugar"
          ? { kind: "sugar", clientKey, value: d.value, context: d.context, recordedAt }
          : { kind: d.kind, clientKey, value: d.value, recordedAt };
    const told = await callEdge("pt-care-reading", body, "patient-web.care.reading");
    if (!told.ok) logger.warn("patient_web.reading.team_not_told", { reason: told.error });
  }
  revalidatePath("/patient", "layout");
  revalidatePath("/pw/patient", "layout");
  return { ok: true };
}

/** The patient's own recent readings, newest first, for the start values and "Last time". */
export async function recentReadingsAction(): Promise<SavedReading[]> {
  const scope = await requirePatientScope();
  // ponytail: last 60 rows of any kind; a kind not logged within them reads "No reading of this kind yet".
  const rows = await listRecentReadings(scope.userId, 60);
  return rows.flatMap((r) => {
    const s = rowToReading(r);
    return s ? [s] : [];
  });
}
