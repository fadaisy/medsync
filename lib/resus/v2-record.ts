import "server-only";

import type { EpisodePhase } from "@/lib/resus/model";
import type { AbcdeStep, ResusEventKind, TimelineEvent } from "@/lib/resus/types";
import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { resusEpisodes, resusTimelineEvents } from "@/db/schema/resus";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Resus Desk v2 write core (GATE A §9). Every v2 write goes through
 * `commitResusEvents`: ONE database transaction holds the event row(s), the
 * episode header change and the audit row. A repeated `clientEventId` returns
 * the row already written (idempotent), so an offline queue can retry safely.
 *
 * Decision support: these functions RECORD what the team did. The timeline stays
 * hard append-only (DB trigger); a correction is a new superseding row.
 * Closed or cancelled episodes are read-only — enforced here, not just in the UI.
 */

/** Bedside time this far before the write marks the row a late entry. */
const LATE_ENTRY_MS = 60_000;

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
  events: V2EventInput[];
  header?: HeaderPatch;
  audit: { action: string; reason: string; after?: Record<string, unknown> };
  /** Allow a write to a closed episode (only the after-close records use this). */
  allowClosed?: boolean;
}): Promise<CommitResult> {
  try {
    return await db.transaction(async (tx) => {
      const [ep] = await tx
        .select({ state: resusEpisodes.state })
        .from(resusEpisodes)
        .where(
          and(eq(resusEpisodes.id, args.episodeId), eq(resusEpisodes.hospitalId, args.hospitalId)),
        )
        .for("update");
      if (!ep) return { ok: false as const, error: "Resus episode not found in your hospital." };
      if (ep.state !== "active" && !args.allowClosed)
        return {
          ok: false as const,
          error: "This resus is closed — the record is read-only.",
          readOnly: true,
        };

      const now = Date.now();
      const out: CommittedEvent[] = [];
      for (const e of args.events) {
        const recordedAt = e.recordedAt ? new Date(e.recordedAt) : new Date(now);
        const inserted = await tx
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
            lateEntry: now - recordedAt.getTime() > LATE_ENTRY_MS,
          })
          .onConflictDoNothing({
            target: [resusTimelineEvents.episodeId, resusTimelineEvents.clientEventId],
            where: sql`client_event_id IS NOT NULL`,
          })
          .returning({ id: resusTimelineEvents.id, createdAt: resusTimelineEvents.createdAt });
        if (inserted[0]) {
          out.push({
            eventId: inserted[0].id,
            clientEventId: e.clientEventId,
            createdAt: inserted[0].createdAt.toISOString(),
            duplicate: false,
          });
        } else {
          const [existing] = await tx
            .select({ id: resusTimelineEvents.id, createdAt: resusTimelineEvents.createdAt })
            .from(resusTimelineEvents)
            .where(
              and(
                eq(resusTimelineEvents.episodeId, args.episodeId),
                eq(resusTimelineEvents.clientEventId, e.clientEventId),
              ),
            );
          if (!existing) throw new Error("idempotent conflict without a row");
          out.push({
            eventId: existing.id,
            clientEventId: e.clientEventId,
            createdAt: existing.createdAt.toISOString(),
            duplicate: true,
          });
        }
      }

      // A pure retry (every event already written) changes nothing else.
      const fresh = out.some((o) => !o.duplicate) || args.events.length === 0;
      if (fresh && args.header && Object.keys(args.header).length > 0) {
        await tx.update(resusEpisodes).set(args.header).where(eq(resusEpisodes.id, args.episodeId));
      }
      if (fresh) {
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
      }
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

/** Rows written after a system time (the realtime / polling delta). */
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
        gt(resusTimelineEvents.createdAt, new Date(sinceIso)),
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
