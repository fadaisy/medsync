import "server-only";

import type {
  AbcdeStep,
  ResusDisposition,
  ResusEpisodeState,
  ResusEventKind,
  ResusTriggerKind,
  TimelineEvent,
} from "@/lib/resus/types";
import type { createServiceClient } from "@/lib/supabase/service";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { resusEpisodes, resusTimelineEvents } from "@/db/schema/resus";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { reconstructTimeline } from "@/lib/resus/timeline";
import { createServiceClient as makeServiceClient } from "@/lib/supabase/service";

/**
 * Resus record layer (GATE B). The resus surface is decision-support:
 * these functions RECORD what the team does. The timeline is hard
 * append-only at the DB (migration 0038) — a correction is a NEW event
 * that supersedes an earlier one; nothing is edited/deleted. Reads go
 * through Drizzle (privileged connection, app-scoped by hospital);
 * writes go through the service client and write an sa_audit_log row.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

/* ─── Episode header ────────────────────────────────────────────────── */

export async function openResusEpisode(args: {
  scopeUserId: string;
  hospitalId: string;
  departmentId: string | null;
  triageRecordId?: string | null;
  intakeId?: string | null;
  patientUserId?: string | null;
  triggerKind: ResusTriggerKind;
  triggerReason?: string | null;
  service?: ServiceClient;
}): Promise<{ episodeId: string } | { error: string }> {
  const service = args.service ?? makeServiceClient();

  const { data: episode, error: insErr } = await service
    .from("resus_episodes")
    .insert({
      hospital_id: args.hospitalId,
      department_id: args.departmentId,
      triage_record_id: args.triageRecordId ?? null,
      intake_id: args.intakeId ?? null,
      patient_user_id: args.patientUserId ?? null,
      trigger_kind: args.triggerKind,
      trigger_reason: args.triggerReason ?? null,
      state: "active",
      opened_by_user_id: args.scopeUserId,
    })
    .select("id")
    .single();

  if (insErr || !episode) {
    logger.error("resus.open_episode.insert_failed", { reason: insErr?.message });
    return { error: "Could not open the resus episode. Please try again." };
  }

  await service.from("sa_audit_log").insert({
    actor_id: args.scopeUserId,
    action: "open_resus_episode",
    target_kind: "resus_episode",
    target_id: episode.id,
    reason: `Resus opened (${args.triggerKind})${args.triggerReason ? `: ${args.triggerReason}` : ""}`,
    before_data: null,
    after_data: { trigger_kind: args.triggerKind, trigger_reason: args.triggerReason ?? null },
  });

  // First timeline entry: the activation itself (immutable record start).
  await appendResusEvent({
    scopeUserId: args.scopeUserId,
    episodeId: episode.id,
    kind: "decision",
    step: "pre",
    payload: {
      summary: `Resus episode opened (${args.triggerKind})`,
      reason: args.triggerReason ?? null,
    },
    service,
  });

  return { episodeId: episode.id };
}

export async function concludeResusEpisode(args: {
  scopeUserId: string;
  episodeId: string;
  state: Extract<ResusEpisodeState, "concluded" | "cancelled">;
  disposition?: ResusDisposition | null;
  outcome?: string | null;
  service?: ServiceClient;
}): Promise<{ ok: true } | { error: string }> {
  const service = args.service ?? makeServiceClient();
  const { error } = await service
    .from("resus_episodes")
    .update({
      state: args.state,
      disposition: args.disposition ?? null,
      outcome: args.outcome ?? null,
      ended_at: new Date().toISOString(),
    })
    .eq("id", args.episodeId);

  if (error) {
    logger.error("resus.conclude_episode.update_failed", { reason: error.message });
    return { error: "Could not conclude the resus episode." };
  }

  await service.from("sa_audit_log").insert({
    actor_id: args.scopeUserId,
    action: "conclude_resus_episode",
    target_kind: "resus_episode",
    target_id: args.episodeId,
    reason: `Resus ${args.state}${args.disposition ? ` → ${args.disposition}` : ""}`,
    before_data: null,
    after_data: { state: args.state, disposition: args.disposition ?? null },
  });
  return { ok: true };
}

export async function fetchResusEpisode(args: { episodeId: string; hospitalId: string }) {
  const [row] = await db
    .select()
    .from(resusEpisodes)
    .where(and(eq(resusEpisodes.id, args.episodeId), eq(resusEpisodes.hospitalId, args.hospitalId)))
    .limit(1);
  return row ?? null;
}

/* ─── Immutable timeline ────────────────────────────────────────────── */

export async function appendResusEvent(args: {
  scopeUserId: string;
  episodeId: string;
  kind: ResusEventKind;
  step?: AbcdeStep | null;
  payload?: Record<string, unknown>;
  /** Free narrative — encrypted at rest (AES-256-GCM). */
  narrative?: string | null;
  recordedAt?: string;
  supersedesEventId?: string | null;
  service?: ServiceClient;
}): Promise<{ eventId: string } | { error: string }> {
  const service = args.service ?? makeServiceClient();

  const { data: row, error } = await service
    .from("resus_timeline_events")
    .insert({
      episode_id: args.episodeId,
      kind: args.kind,
      step: args.step ?? null,
      recorded_by_user_id: args.scopeUserId,
      recorded_at: args.recordedAt ?? new Date().toISOString(),
      payload: args.payload ?? {},
      narrative_encrypted: args.narrative ? encrypt(args.narrative) : null,
      supersedes_event_id: args.supersedesEventId ?? null,
    })
    .select("id")
    .single();

  if (error || !row) {
    logger.error("resus.append_event.insert_failed", { reason: error?.message });
    return { error: "Could not record the resus event." };
  }

  const isCorrection = Boolean(args.supersedesEventId);
  await service.from("sa_audit_log").insert({
    actor_id: args.scopeUserId,
    action: isCorrection ? "correct_resus_event" : "record_resus_event",
    target_kind: "resus_timeline_event",
    target_id: row.id,
    reason: isCorrection
      ? `Correction of resus event ${args.supersedesEventId} (${args.kind})`
      : `Resus ${args.kind}${args.step ? ` [${args.step}]` : ""}`,
    before_data: null,
    after_data: {
      kind: args.kind,
      step: args.step ?? null,
      supersedes: args.supersedesEventId ?? null,
    },
  });

  return { eventId: row.id };
}

/**
 * Correct an earlier event: append a NEW event that supersedes it. The
 * original is retained immutably; only the active view hides it.
 */
export async function correctResusEvent(args: {
  scopeUserId: string;
  episodeId: string;
  supersedesEventId: string;
  kind: ResusEventKind;
  step?: AbcdeStep | null;
  payload?: Record<string, unknown>;
  narrative?: string | null;
  service?: ServiceClient;
}): Promise<{ eventId: string } | { error: string }> {
  return appendResusEvent(args);
}

/**
 * Fetch the reconstructed (active) timeline for an episode, ordered by
 * clinical time. The full immutable store is read; corrections are
 * applied in-memory by the pure reconstruction.
 */
export async function fetchResusTimeline(episodeId: string): Promise<TimelineEvent[]> {
  const rows = await db
    .select()
    .from(resusTimelineEvents)
    .where(eq(resusTimelineEvents.episodeId, episodeId));

  const events: TimelineEvent[] = rows.map((r) => ({
    id: r.id,
    episodeId: r.episodeId,
    kind: r.kind as ResusEventKind,
    step: (r.step as AbcdeStep | null) ?? null,
    recordedByUserId: r.recordedByUserId,
    recordedAt: r.recordedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    payload: (r.payload as Record<string, unknown>) ?? {},
    supersedesEventId: r.supersedesEventId,
  }));

  return reconstructTimeline(events);
}
