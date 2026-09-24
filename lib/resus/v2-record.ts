import "server-only";

import type { EpisodePhase } from "@/lib/resus/model";
import type { AbcdeStep, ResusEventKind, TimelineEvent } from "@/lib/resus/types";
import { and, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import { resusEpisodes, resusTimelineEvents } from "@/db/schema/resus";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { reconstructTimeline } from "@/lib/resus/timeline";
import {
  bedsideTimeProblem,
  deltaFloor,
  deriveHeader,
  isLateEntry,
  RECORD_MOVED,
  replayOf,
} from "@/lib/resus/v2-rules";

/**
 * Resus Desk v2 write core (GATE A §9). Every v2 write goes through
 * `commitResusEvents`: ONE database transaction holds the event row(s), the
 * episode header change and the audit row. A repeated `clientEventId` returns
 * the rows already written (idempotent, all or nothing), so an offline queue can
 * retry safely. The header's phase and arrest sequence are derived from the
 * timeline under the lock, and bedside times are bounded (Law 6).
 *
 * Decision support: these functions RECORD what the team did. The timeline stays
 * hard append-only (DB trigger); a correction is a new superseding row.
 * Closed or cancelled episodes are read-only — enforced here, not just in the UI.
 */

export type ResusTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface V2EventInput {
  clientEventId: string;
  kind: ResusEventKind;
  step: AbcdeStep | null;
  payload: Record<string, unknown>;
  arrestSeq?: number | null;
  /** ISO bedside time; defaults to now. */
  recordedAt?: string;
  narrative?: string | null;
  supersedesEventId?: string | null;
}

export interface HeaderPatch {
  /**
   * phase / currentArrestSeq / arrestDetectedAt are DERIVED from the timeline
   * under the lock (GATE A §1, E4); a value passed here is ignored.
   */
  phase?: EpisodePhase;
  currentArrestSeq?: number;
  arrestDetectedAt?: Date;
  state?: "active" | "concluded" | "cancelled";
  outcomeCode?: string | null;
  closureKind?: "bedside" | "administrative" | null;
  closedBy?: string | null;
  cancelReason?: string | null;
  disposition?: string | null;
  outcome?: string | null;
  endedAt?: Date | null;
  dispositionDecidedAt?: Date | null;
  suggestedLevel?: string | null;
  chosenLevel?: string | null;
  levelMismatchCode?: string | null;
  destinationUnitId?: string | null;
  deathConfirmedAt?: Date | null;
  pendingEncounterHandoff?: boolean;
  encounterId?: string | null;
  bayProfileId?: string | null;
  idleNotifiedAt?: Date | null;
}

export interface CommittedEvent {
  eventId: string;
  clientEventId: string;
  createdAt: string;
  duplicate: boolean;
}

export type CommitResult =
  | { ok: true; events: CommittedEvent[]; serverTime: string }
  | { ok: false; error: string; readOnly?: boolean };

export async function commitResusEvents(args: {
  scopeUserId: string;
  hospitalId: string;
  episodeId: string;
  /** The first event is the primary: its clientEventId makes the whole batch idempotent. */
  events: V2EventInput[];
  header?: HeaderPatch;
  audit: { action: string; reason: string; after?: Record<string, unknown> };
  /** Allow a write to a closed episode (only the after-close records use this). */
  allowClosed?: boolean;
  /**
   * The row count the caller's checks were made on (prelude().rows). Under the
   * lock a different count means the record moved: nothing is written and the
   * queue retries on a fresh read, so every check holds at commit.
   */
  expectRows?: number;
  /** Further writes in the SAME transaction (a new batch only, never a retry). */
  also?: (tx: ResusTx) => Promise<void>;
}): Promise<CommitResult> {
  try {
    return await db.transaction(async (tx) => {
      const [ep] = await tx
        .select({
          state: resusEpisodes.state,
          startedAt: resusEpisodes.startedAt,
          phase: resusEpisodes.phase,
          currentArrestSeq: resusEpisodes.currentArrestSeq,
          arrestDetectedAt: resusEpisodes.arrestDetectedAt,
        })
        .from(resusEpisodes)
        .where(
          and(eq(resusEpisodes.id, args.episodeId), eq(resusEpisodes.hospitalId, args.hospitalId)),
        )
        .for("update");
      if (!ep) return { ok: false as const, error: "Resus episode not found in your hospital." };
      const rows = (
        await tx
          .select()
          .from(resusTimelineEvents)
          .where(eq(resusTimelineEvents.episodeId, args.episodeId))
      ).map(toTimelineEvent);

      // A retry (the primary already landed) returns what was written — all or nothing.
      const replay = replayOf(args.events, rows);
      if (replay)
        return { ok: true as const, events: replay, serverTime: new Date().toISOString() };
      if (ep.state !== "active" && !args.allowClosed)
        return {
          ok: false as const,
          error: "This resus is closed — the record is read-only.",
          readOnly: true,
        };
      if (args.expectRows !== undefined && rows.length !== args.expectRows)
        return { ok: false as const, error: RECORD_MOVED };

      const now = Date.now();
      for (const e of args.events) {
        const problem = e.recordedAt
          ? bedsideTimeProblem(Date.parse(e.recordedAt), now, ep.startedAt.getTime())
          : null;
        if (problem) return { ok: false as const, error: problem };
      }

      const out: CommittedEvent[] = [];
      const written: TimelineEvent[] = [];
      for (const e of args.events) {
        const recordedAt = e.recordedAt ? new Date(e.recordedAt) : new Date(now);
        const [row] = await tx
          .insert(resusTimelineEvents)
          .values({
            episodeId: args.episodeId,
            kind: e.kind,
            step: e.step,
            recordedByUserId: args.scopeUserId,
            recordedAt,
            payload: e.payload,
            narrativeEncrypted: e.narrative ? encrypt(e.narrative) : null,
            supersedesEventId: e.supersedesEventId ?? null,
            arrestSeq: e.arrestSeq ?? null,
            clientEventId: e.clientEventId,
            lateEntry: isLateEntry(recordedAt.getTime(), now),
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        written.push(toTimelineEvent(row));
        out.push({
          eventId: row.id,
          clientEventId: e.clientEventId,
          createdAt: row.createdAt.toISOString(),
          duplicate: false,
        });
      }

      // The header follows the timeline, never the action's intent (GATE A §1, E4).
      const patch: HeaderPatch = { ...args.header };
      delete patch.phase;
      delete patch.currentArrestSeq;
      delete patch.arrestDetectedAt;
      const d = deriveHeader([...rows, ...written]);
      if (d.phase !== ep.phase) patch.phase = d.phase;
      if (d.currentArrestSeq !== ep.currentArrestSeq) patch.currentArrestSeq = d.currentArrestSeq;
      if (d.arrestDetectedAt && d.arrestDetectedAt.getTime() !== ep.arrestDetectedAt?.getTime())
        patch.arrestDetectedAt = d.arrestDetectedAt;
      if (Object.keys(patch).length > 0)
        await tx.update(resusEpisodes).set(patch).where(eq(resusEpisodes.id, args.episodeId));
      if (args.also) await args.also(tx);
      await tx.insert(saAuditLog).values({
        actorId: args.scopeUserId,
        action: args.audit.action,
        targetKind: "resus_episode",
        targetId: args.episodeId,
        reason: args.audit.reason.slice(0, 500),
        beforeData: null,
        afterData: {
          ...(args.audit.after ?? {}),
          events: out.map((o) => ({ id: o.eventId, clientEventId: o.clientEventId })),
        },
      });
      return { ok: true as const, events: out, serverTime: new Date().toISOString() };
    });
  } catch (e) {
    logger.error("resus.v2.commit_failed", { reason: String(e) });
    return { ok: false, error: "Could not record — the entry is kept and will retry." };
  }
}

function toTimelineEvent(r: typeof resusTimelineEvents.$inferSelect): TimelineEvent {
  return {
    id: r.id,
    episodeId: r.episodeId,
    kind: r.kind as ResusEventKind,
    step: (r.step as AbcdeStep | null) ?? null,
    recordedByUserId: r.recordedByUserId,
    recordedAt: r.recordedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    payload: (r.payload as Record<string, unknown>) ?? {},
    supersedesEventId: r.supersedesEventId,
    arrestSeq: r.arrestSeq,
    clientEventId: r.clientEventId,
    lateEntry: r.lateEntry,
  };
}

/** Every row of the episode (the full immutable store, incl. superseded rows). */
export async function fetchAllResusEvents(episodeId: string): Promise<TimelineEvent[]> {
  const rows = await db
    .select()
    .from(resusTimelineEvents)
    .where(eq(resusTimelineEvents.episodeId, episodeId));
  return rows.map(toTimelineEvent);
}

/** The active view (corrections applied). */
export async function fetchActiveResusEvents(episodeId: string): Promise<TimelineEvent[]> {
  return reconstructTimeline(await fetchAllResusEvents(episodeId));
}

/** Rows written after a system time, with an overlap (the realtime / polling delta). */
export async function fetchResusEventsSince(
  episodeId: string,
  sinceIso: string,
): Promise<TimelineEvent[]> {
  const rows = await db
    .select()
    .from(resusTimelineEvents)
    .where(
      and(
        eq(resusTimelineEvents.episodeId, episodeId),
        gt(resusTimelineEvents.createdAt, deltaFloor(sinceIso)),
      ),
    );
  return rows.map(toTimelineEvent);
}

/** Look up rows by client id (to confirm a queued write landed). */
export async function fetchByClientIds(
  episodeId: string,
  clientEventIds: string[],
): Promise<TimelineEvent[]> {
  if (clientEventIds.length === 0) return [];
  const rows = await db
    .select()
    .from(resusTimelineEvents)
    .where(
      and(
        eq(resusTimelineEvents.episodeId, episodeId),
        inArray(resusTimelineEvents.clientEventId, clientEventIds),
      ),
    );
  return rows.map(toTimelineEvent);
}
