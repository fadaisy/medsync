"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { stoppedRxIds } from "@/lib/emr/closure";
import { DISPOSITION_CODES } from "@/lib/emr/encounter";
import { emrV1LiveFor, encounterCloseV2LiveFor } from "@/lib/emr/feature";
import { CLOSURE_REASON_CODES } from "@/lib/emr/settings";
import { actionError, withPatientWrite } from "@/lib/emr/write/context";
import { afterClose, planAdministrativeClosure, planCompletion } from "@/lib/emr/write/encounter";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Encounter lifecycle (PROMPT §8, ADR 0139). The Edge Functions stay the one lifecycle path
 * (HARMONISATION R2): start reuses the visit's open encounter; completion and administrative
 * closure are planned here in the clinician's transaction (access check, transition rules, the
 * three warnings), then written by ha-complete-encounter with its cascade. Warnings are returned.
 */

const surface = z.enum(["doctor", "clinician"]);
const uuid = z.uuid();
const serverTime = () => new Date().toISOString();
const off = {
  ok: false as const,
  code: "config" as const,
  error: "The record is not switched on at this hospital.",
};

function revalidate(encounterId: string) {
  for (const p of [
    "/doctor",
    "/doctor/schedule",
    "/doctor/encounters",
    `/doctor/encounters/${encounterId}`,
    "/reception/expected",
    "/nurse/triage",
    "/nurse/beds",
  ])
    revalidatePath(p);
}

const StartEncounter = z
  .object({
    surface: z.enum(["doctor", "nurse", "clinician"]),
    appointmentId: uuid.optional(),
    queueEntryId: uuid.optional(),
    visitId: uuid.optional(),
    encounterType: z
      .enum([
        "opd",
        "inpatient",
        "emergency",
        "follow_up",
        "tele",
        "antenatal",
        "procedure",
        "virtual",
        "community",
      ])
      .optional(),
    templateId: z.string().max(80).optional(),
    reason: z.string().trim().min(8).max(500).default("Calling next patient."),
  })
  .refine((v) => v.appointmentId || v.queueEntryId, {
    message: "Need an appointment or queue entry to start.",
  });

/** Start (or resume) the visit's encounter through ha-start-encounter. */
export async function startEncounter(raw: unknown): Promise<ActionResult> {
  const parsed = StartEncounter.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const i = parsed.data;
  const actor = await requireEmrActor(i.surface);
  if (!emrV1LiveFor(actor.hospitalId)) return off;
  const r = await callEdge<{ encounter_id: string }>(
    "ha-start-encounter",
    {
      appointment_id: i.appointmentId,
      queue_entry_id: i.queueEntryId,
      visit_id: i.visitId,
      encounter_type: i.encounterType,
      template_id: i.templateId,
      reason: i.reason,
    },
    `${i.surface}.emr`,
  );
  if (!r.ok) return { ok: false, code: "conflict", error: r.error };
  revalidate(r.data.encounter_id);
  return { ok: true, id: r.data.encounter_id, serverTime: serverTime() };
}

const CompleteEncounter = z.object({
  surface,
  patientUserId: uuid,
  encounterId: uuid,
  disposition: z.enum(DISPOSITION_CODES),
  dispositionDetail: z.record(z.string().max(40), z.string().max(500)).optional(),
  followUp: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }),
      z.object({ kind: z.literal("as_needed") }),
      z.object({ kind: z.literal("review_date"), date: z.iso.date() }),
      z.object({ kind: z.literal("booked"), date: z.iso.date(), appointmentId: uuid }),
    ])
    .optional(),
  /** ADR 0198–0200 (ENCOUNTER_CLOSE_V2): the ward, and a bed or why the patient waits. */
  admission: z
    .object({
      wardId: uuid,
      bedId: uuid.optional(),
      waitReason: z.enum(["no_free_bed", "extra_bed", "floor", "other"]).optional(),
      waitNote: z.string().trim().max(500).optional(),
      leadingConditionId: uuid.optional(),
    })
    .optional(),
});

/** What ha-complete-encounter returns, inside the functions' `{ ok, data }` envelope. */
type CompleteResponse = {
  data?: {
    encounter_id: string;
    admission?: { admission_id: string; ward: string; bed: string | null };
  };
};

/** Complete the visit: a disposition is required; warnings come back with the result. */
export async function completeEncounter(raw: unknown): Promise<ActionResult> {
  const parsed = CompleteEncounter.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const i = parsed.data;
  const actor = await requireEmrActor(i.surface);
  if (!emrV1LiveFor(actor.hospitalId)) return off;
  const v2 = !!i.admission || i.followUp?.kind === "booked" || !!i.dispositionDetail?.stopped_rx;
  if (v2 && !encounterCloseV2LiveFor(actor.hospitalId))
    return {
      ok: false,
      code: "config",
      error: "Closing with an admission is not switched on here.",
    };
  try {
    const plan = await withPatientWrite(actor, i.patientUserId, (ctx) => planCompletion(ctx, i));
    const r = await callEdge<CompleteResponse>(
      "ha-complete-encounter",
      plan.body,
      `${i.surface}.emr`,
    );
    if (!r.ok) return { ok: false, code: "conflict", error: r.error };
    // The visit is closed; what follows is the clinician's own record (ADR 0197, 0201).
    const stop = i.disposition === "home" ? stoppedRxIds(i.dispositionDetail) : [];
    const admissionId = r.data?.data?.admission?.admission_id ?? null;
    let after: string[] = [];
    if (stop.length || admissionId) {
      try {
        after = await withPatientWrite(actor, i.patientUserId, (ctx) =>
          afterClose(ctx, {
            patientUserId: i.patientUserId,
            encounterId: plan.id,
            stopRxIds: stop,
            admissionId,
          }),
        );
      } catch (e) {
        after = [
          e instanceof Error && e.message
            ? `The visit is closed, but: ${e.message}`
            : "The visit is closed, but stopping the medicines or requesting the co-sign failed.",
        ];
      }
    }
    revalidate(plan.id);
    const warnings = [...plan.warnings, ...after];
    return {
      ok: true,
      id: plan.id,
      serverTime: serverTime(),
      ...(warnings.length ? { warnings } : {}),
    };
  } catch (e) {
    return actionError(e);
  }
}

const CloseAdministratively = z.object({
  surface,
  patientUserId: uuid,
  encounterId: uuid,
  reason: z.enum(CLOSURE_REASON_CODES),
  note: z.string().trim().max(1000).optional(),
});

/** Close a stale encounter with a reason (never automatic; audited by the Edge Function and 0071). */
export async function closeEncounterAdministratively(raw: unknown): Promise<ActionResult> {
  const parsed = CloseAdministratively.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const i = parsed.data;
  const actor = await requireEmrActor(i.surface);
  if (!emrV1LiveFor(actor.hospitalId)) return off;
  try {
    const plan = await withPatientWrite(actor, i.patientUserId, (ctx) =>
      planAdministrativeClosure(ctx, i),
    );
    const r = await callEdge("ha-complete-encounter", plan.body, `${i.surface}.emr`);
    if (!r.ok) return { ok: false, code: "conflict", error: r.error };
    revalidate(plan.id);
    return { ok: true, id: plan.id, serverTime: serverTime() };
  } catch (e) {
    return actionError(e);
  }
}
