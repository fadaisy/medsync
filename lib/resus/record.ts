import "server-only";

import type {
  AbcdeStep,
  ResusDisposition,
  ResusEpisodeState,
  ResusEventKind,
  ResusRole,
  ResusTriggerKind,
  TimelineEvent,
} from "@/lib/resus/types";
import type { createServiceClient } from "@/lib/supabase/service";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  resusEpisodes,
  resusMobilisationAlerts,
  resusRoleAssignments,
  resusTimelineEvents,
} from "@/db/schema/resus";
import { users } from "@/db/schema/users";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { reconstructTimeline, resolveRoster } from "@/lib/resus/timeline";
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

/* ─── Roles ─────────────────────────────────────────────────────────── */

export interface RosterEntry {
  role: ResusRole;
  userId: string;
  fullName: string | null;
  assignedAtIso: string;
}

/** Current team roster (open assignments), with responder names. */
export async function fetchResusRoster(episodeId: string): Promise<RosterEntry[]> {
  const rows = await db
    .select({
      id: resusRoleAssignments.id,
      episodeId: resusRoleAssignments.episodeId,
      userId: resusRoleAssignments.userId,
      role: resusRoleAssignments.role,
      assignedAt: resusRoleAssignments.assignedAt,
      endedAt: resusRoleAssignments.endedAt,
      fullName: users.fullName,
    })
    .from(resusRoleAssignments)
    .leftJoin(users, eq(users.id, resusRoleAssignments.userId))
    .where(eq(resusRoleAssignments.episodeId, episodeId));

  const nameById = new Map(rows.map((r) => [r.userId + r.id, r.fullName]));
  const current = resolveRoster(
    rows.map((r) => ({
      id: r.id,
      episodeId: r.episodeId,
      userId: r.userId,
      role: r.role as ResusRole,
      assignedAt: r.assignedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    })),
  );
  return current.map((a) => ({
    role: a.role,
    userId: a.userId,
    fullName: nameById.get(a.userId + a.id) ?? null,
    assignedAtIso: a.assignedAt,
  }));
}

/** Assign (or hand over) a role: close any open holder, open a new one. */
export async function assignResusRole(args: {
  scopeUserId: string;
  episodeId: string;
  userId: string;
  role: ResusRole;
  service?: ServiceClient;
}): Promise<{ ok: true } | { error: string }> {
  const service = args.service ?? makeServiceClient();

  // Close any current open holder of this role (hand-over).
  await service
    .from("resus_role_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("episode_id", args.episodeId)
    .eq("role", args.role)
    .is("ended_at", null);

  const { error } = await service.from("resus_role_assignments").insert({
    episode_id: args.episodeId,
    user_id: args.userId,
    role: args.role,
    assigned_by_user_id: args.scopeUserId,
  });
  if (error) {
    logger.error("resus.assign_role.failed", { reason: error.message });
    return { error: "Could not assign the role." };
  }

  await service.from("sa_audit_log").insert({
    actor_id: args.scopeUserId,
    action: "assign_resus_role",
    target_kind: "resus_role_assignment",
    target_id: args.episodeId,
    reason: `Role ${args.role} assigned`,
    before_data: null,
    after_data: { role: args.role, user_id: args.userId },
  });

  await appendResusEvent({
    scopeUserId: args.scopeUserId,
    episodeId: args.episodeId,
    kind: "role_change",
    step: "pre",
    payload: { label: `Role assigned: ${args.role}`, role: args.role, userId: args.userId },
    service,
  });
  return { ok: true };
}

/* ─── Mobilisation / responders ─────────────────────────────────────── */

export interface ResponderEntry {
  userId: string;
  fullName: string | null;
  responding: boolean;
  acknowledgedAtIso: string | null;
}

export async function fetchResusResponders(episodeId: string): Promise<ResponderEntry[]> {
  const rows = await db
    .select({
      userId: resusMobilisationAlerts.recipientUserId,
      responding: resusMobilisationAlerts.responding,
      acknowledgedAt: resusMobilisationAlerts.acknowledgedAt,
      fullName: users.fullName,
    })
    .from(resusMobilisationAlerts)
    .leftJoin(users, eq(users.id, resusMobilisationAlerts.recipientUserId))
    .where(eq(resusMobilisationAlerts.episodeId, episodeId));

  return rows.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    responding: r.responding,
    acknowledgedAtIso: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
  }));
}

/** The current user marks themselves as responding (converging). */
export async function acknowledgeResusAlert(args: {
  scopeUserId: string;
  episodeId: string;
  service?: ServiceClient;
}): Promise<{ ok: true } | { error: string }> {
  const service = args.service ?? makeServiceClient();
  const { error } = await service
    .from("resus_mobilisation_alerts")
    .update({ responding: true, acknowledged_at: new Date().toISOString() })
    .eq("episode_id", args.episodeId)
    .eq("recipient_user_id", args.scopeUserId);
  if (error) return { error: "Could not acknowledge." };
  return { ok: true };
}

/* ─── Arrest seam ───────────────────────────────────────────────────── */

/**
 * Mark cardiac arrest detected: stamp the episode, log the arrest + CPR
 * events, and audit. This is the SEAM only — it routes to the ALS module;
 * it builds NO arrest algorithm (rhythm/defib/drugs/4Hs-4Ts).
 */
export async function markResusArrest(args: {
  scopeUserId: string;
  episodeId: string;
  reason: string;
  service?: ServiceClient;
}): Promise<{ ok: true } | { error: string }> {
  const service = args.service ?? makeServiceClient();

  const { error } = await service
    .from("resus_episodes")
    .update({ arrest_detected_at: new Date().toISOString() })
    .eq("id", args.episodeId)
    .is("arrest_detected_at", null);
  if (error) {
    logger.error("resus.mark_arrest.failed", { reason: error.message });
    return { error: "Could not flag arrest." };
  }

  await service.from("sa_audit_log").insert({
    actor_id: args.scopeUserId,
    action: "detect_resus_arrest",
    target_kind: "resus_episode",
    target_id: args.episodeId,
    reason: `Arrest detected: ${args.reason}`,
    before_data: null,
    after_data: { reason: args.reason, routed_to: "als_module_stub" },
  });

  await appendResusEvent({
    scopeUserId: args.scopeUserId,
    episodeId: args.episodeId,
    kind: "arrest_detected",
    step: "arrest",
    payload: {
      label: `Cardiac arrest detected — ${args.reason}`,
      routedTo: "ALS module (to follow)",
    },
    service,
  });
  await appendResusEvent({
    scopeUserId: args.scopeUserId,
    episodeId: args.episodeId,
    kind: "cpr_started",
    step: "arrest",
    payload: { label: "Start CPR — ALS cardiac-arrest module (to follow)" },
    service,
  });
  return { ok: true };
}
