"use server";

import type { AbcdeStep, ResusEventKind } from "@/lib/resus/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { resusEpisodes } from "@/db/schema/resus";
import { triageRecords } from "@/db/schema/triage";
import { logger } from "@/lib/logger";
import { appendResusEvent, concludeResusEpisode, openResusEpisode } from "@/lib/resus/record";
import { requireResusScope } from "@/lib/resus/scope";

/**
 * Resus server actions (GATE C). Decision-support: these RECORD what the
 * team does — they never order or auto-administer. Every write is
 * authorised by requireResusScope and audited in the record layer.
 */

const STEP_VALUES = ["pre", "A", "B", "C", "D", "E", "arrest"] as const;
const KIND_VALUES = [
  "assessment",
  "action",
  "drug",
  "fluid",
  "procedure",
  "vital",
  "decision",
  "role_change",
  "mobilisation",
  "reassessment",
  "arrest_detected",
  "cpr_started",
  "handover",
  "note",
] as const;

/** Open a resus episode from a Red/L1 triage record, then go to the desk. */
export async function openResusFromTriage(triageRecordId: string): Promise<{ error: string }> {
  const parsed = z.string().uuid().safeParse(triageRecordId);
  if (!parsed.success) return { error: "Invalid triage record." };

  const scope = await requireResusScope();

  const [tr] = await db
    .select({
      id: triageRecords.id,
      intakeId: triageRecords.intakeId,
      patientUserId: triageRecords.patientUserId,
      departmentId: triageRecords.departmentId,
      fastTracked: triageRecords.lifeThreatFastTracked,
      breakdown: triageRecords.computedBreakdown,
    })
    .from(triageRecords)
    .where(and(eq(triageRecords.id, parsed.data), eq(triageRecords.hospitalId, scope.hospitalId)))
    .limit(1);

  if (!tr) return { error: "Triage record not found in your hospital." };

  // Reuse an existing active episode for this triage record (idempotent open).
  const [existing] = await db
    .select({ id: resusEpisodes.id })
    .from(resusEpisodes)
    .where(and(eq(resusEpisodes.triageRecordId, tr.id), eq(resusEpisodes.state, "active")))
    .limit(1);
  if (existing) redirect(`/nurse/resus/${existing.id}`);

  const reason = (tr.breakdown as { lifeThreatReason?: string })?.lifeThreatReason ?? null;
  const result = await openResusEpisode({
    scopeUserId: scope.userId,
    hospitalId: scope.hospitalId,
    departmentId: tr.departmentId ?? scope.departmentId,
    triageRecordId: tr.id,
    intakeId: tr.intakeId,
    patientUserId: tr.patientUserId,
    triggerKind: tr.fastTracked ? "step0_life_threat" : "triage_red",
    triggerReason: reason,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/nurse/resus");
  redirect(`/nurse/resus/${result.episodeId}`);
}

/** Open an ad-hoc resus for an in-resus deterioration (no triage record). */
export async function openBlankResus(): Promise<{ error: string }> {
  const scope = await requireResusScope();
  const result = await openResusEpisode({
    scopeUserId: scope.userId,
    hospitalId: scope.hospitalId,
    departmentId: scope.departmentId,
    triggerKind: "in_resus_deterioration",
    triggerReason: "Opened directly (in-resus deterioration / unlinked)",
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/nurse/resus");
  redirect(`/nurse/resus/${result.episodeId}`);
}

const LogSchema = z.object({
  episodeId: z.string().uuid(),
  kind: z.enum(KIND_VALUES),
  step: z.enum(STEP_VALUES).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  narrative: z.string().max(2000).nullable().optional(),
});

export async function logResusEvent(
  input: z.infer<typeof LogSchema>,
): Promise<{ ok?: true; eventId?: string; error?: string }> {
  const parsed = LogSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid resus event." };
  const scope = await requireResusScope();

  const result = await appendResusEvent({
    scopeUserId: scope.userId,
    episodeId: parsed.data.episodeId,
    kind: parsed.data.kind as ResusEventKind,
    step: (parsed.data.step ?? null) as AbcdeStep | null,
    payload: parsed.data.payload ?? {},
    narrative: parsed.data.narrative ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/nurse/resus/${parsed.data.episodeId}`);
  return { ok: true, eventId: result.eventId };
}

const CorrectSchema = LogSchema.extend({ supersedesEventId: z.string().uuid() });

export async function correctResusEvent(
  input: z.infer<typeof CorrectSchema>,
): Promise<{ ok?: true; eventId?: string; error?: string }> {
  const parsed = CorrectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid correction." };
  const scope = await requireResusScope();

  const result = await appendResusEvent({
    scopeUserId: scope.userId,
    episodeId: parsed.data.episodeId,
    kind: parsed.data.kind as ResusEventKind,
    step: (parsed.data.step ?? null) as AbcdeStep | null,
    payload: parsed.data.payload ?? {},
    narrative: parsed.data.narrative ?? null,
    supersedesEventId: parsed.data.supersedesEventId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/nurse/resus/${parsed.data.episodeId}`);
  return { ok: true, eventId: result.eventId };
}

const VitalsSchema = z.object({
  episodeId: z.string().uuid(),
  snapshot: z.object({
    hr: z.number().nullable().optional(),
    rr: z.number().nullable().optional(),
    spo2: z.number().nullable().optional(),
    systolicBp: z.number().nullable().optional(),
    diastolicBp: z.number().nullable().optional(),
    temperature: z.number().nullable().optional(),
    glucose: z.number().nullable().optional(),
    gcs: z.number().nullable().optional(),
    etco2: z.number().nullable().optional(),
    urineOutput: z.number().nullable().optional(),
    consciousness: z.enum(["A", "C", "V", "P", "U"]).nullable().optional(),
    oxygen: z.enum(["air", "oxygen"]).nullable().optional(),
  }),
});

/** Map a snapshot to clinical_observations rows (longitudinal mirror). */
function observationRows(
  snap: z.infer<typeof VitalsSchema>["snapshot"],
  base: { hospital_id: string; patient_user_id: string; recorded_by_user_id: string },
) {
  const rows: Record<string, unknown>[] = [];
  const push = (kind: string, v1: number | null | undefined, unit: string) => {
    if (v1 == null) return;
    rows.push({
      ...base,
      observation_kind: kind,
      numeric_value_1: v1,
      numeric_value_2: null,
      unit,
    });
  };
  push("hr", snap.hr, "/min");
  push("rr", snap.rr, "/min");
  push("spo2", snap.spo2, "%");
  if (snap.systolicBp != null || snap.diastolicBp != null)
    rows.push({
      ...base,
      observation_kind: "bp",
      numeric_value_1: snap.systolicBp ?? null,
      numeric_value_2: snap.diastolicBp ?? null,
      unit: "mmHg",
    });
  push("temperature", snap.temperature, "°C");
  push("glucose", snap.glucose, "mmol/L");
  push("gcs", snap.gcs, "/15");
  push("etco2", snap.etco2, "kPa");
  push("urine_output", snap.urineOutput, "mL");
  return rows;
}

export async function logResusVitals(
  input: z.infer<typeof VitalsSchema>,
): Promise<{ ok?: true; error?: string }> {
  const parsed = VitalsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid vitals." };
  const scope = await requireResusScope();

  const [ep] = await db
    .select({ patientUserId: resusEpisodes.patientUserId, hospitalId: resusEpisodes.hospitalId })
    .from(resusEpisodes)
    .where(
      and(
        eq(resusEpisodes.id, parsed.data.episodeId),
        eq(resusEpisodes.hospitalId, scope.hospitalId),
      ),
    )
    .limit(1);
  if (!ep) return { error: "Resus episode not found." };

  const snap = parsed.data.snapshot;
  const recorded = Object.entries(snap)
    .filter(([, v]) => v != null)
    .map(([k]) => k);
  if (recorded.length === 0) return { error: "Enter at least one vital." };

  // Primary, immutable record: a resus timeline 'vital' event.
  const ev = await appendResusEvent({
    scopeUserId: scope.userId,
    episodeId: parsed.data.episodeId,
    kind: "vital",
    step: "C",
    payload: { label: `Vitals: ${recorded.join(", ")}`, snapshot: snap },
  });
  if ("error" in ev) return { error: ev.error };

  // Best-effort mirror into the longitudinal vitals store (only when the
  // patient is identified — clinical_observations is patient-keyed).
  if (ep.patientUserId) {
    try {
      const rows = observationRows(snap, {
        hospital_id: ep.hospitalId,
        patient_user_id: ep.patientUserId,
        recorded_by_user_id: scope.userId,
      });
      if (rows.length > 0) {
        const { createServiceClient } = await import("@/lib/supabase/service");
        const service = createServiceClient();
        await service.from("clinical_observations").insert(rows);
        await service.from("sa_audit_log").insert({
          actor_id: scope.userId,
          action: "record_observation",
          target_kind: "resus_episode",
          target_id: parsed.data.episodeId,
          reason: `Resus vitals mirrored to record: ${recorded.join(", ")}`,
          before_data: null,
          after_data: { kinds: recorded },
        });
      }
    } catch (e) {
      logger.warn("resus.vitals.observation_mirror_failed", { reason: String(e) });
    }
  }

  revalidatePath(`/nurse/resus/${parsed.data.episodeId}`);
  return { ok: true };
}

const ConcludeSchema = z.object({
  episodeId: z.string().uuid(),
  state: z.enum(["concluded", "cancelled"]),
  disposition: z
    .enum(["theatre", "icu", "cath_lab", "ward", "mortuary", "transferred", "deceased"])
    .nullable()
    .optional(),
  outcome: z.string().max(1000).nullable().optional(),
});

export async function concludeResus(
  input: z.infer<typeof ConcludeSchema>,
): Promise<{ ok?: true; error?: string }> {
  const parsed = ConcludeSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid conclusion." };
  const scope = await requireResusScope();

  const result = await concludeResusEpisode({
    scopeUserId: scope.userId,
    episodeId: parsed.data.episodeId,
    state: parsed.data.state,
    disposition: parsed.data.disposition ?? null,
    outcome: parsed.data.outcome ?? null,
  });
  if ("error" in result) {
    logger.warn("resus.conclude.failed", { episode: parsed.data.episodeId });
    return { error: result.error };
  }
  revalidatePath(`/nurse/resus/${parsed.data.episodeId}`);
  revalidatePath("/nurse/resus");
  return { ok: true };
}
