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
