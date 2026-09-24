import "server-only";

import type { ResusScope } from "@/lib/resus/scope";
import type { TimelineEvent } from "@/lib/resus/types";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { cadres } from "@/db/schema/reference-data";
import { resusEpisodes } from "@/db/schema/resus";
import { computeAgeYears } from "@/lib/age";
import { requireResusScope } from "@/lib/resus/scope";
import { reconstructTimeline } from "@/lib/resus/timeline";
import { fetchAllResusEvents } from "@/lib/resus/v2-record";

/**
 * Shared plumbing for the Resus Desk v2 server actions (not itself a "use
 * server" module). Every action: Zod input with a client idempotency key and
 * optional bedside time → AAL2 + clinical scope (resusScopeOrNull) → episode in
 * the caller's hospital → one transaction via commitResusEvents.
 */

/** The session ended or lost AAL2: the entry stays queued ("will retry" → the client retries). */
export const SIGNED_OUT = "Signed out — sign in again (new tab); entries are kept and will retry.";

/**
 * requireResusScope without its redirect. A redirect() thrown from a server
 * action navigates the desk away mid-resus and drops the in-memory queue, so a
 * lapsed session (or AAL) is null here — the caller answers SIGNED_OUT instead.
 */
export async function resusScopeOrNull(): Promise<ResusScope | null> {
  try {
    return await requireResusScope();
  } catch (e) {
    if (isRedirectError(e)) return null;
    throw e;
  }
}

export const WriteBase = z.object({
  episodeId: z.string().uuid(),
  clientEventId: z.string().uuid(),
  /** Bedside time (ISO). Server-anchored on the client; defaults to now. */
  recordedAt: z.string().datetime({ offset: true }).optional(),
});

export type ActionResult<T extends object = object> =
  | ({ ok: true; serverTime: string; eventIds: string[] } & T)
  | { ok: false; error: string; readOnly?: boolean; signedOut?: boolean };

export interface EpisodeHeader {
  id: string;
  hospitalId: string;
  departmentId: string | null;
  /** The episode's department — where the patient is (the arrest call names it). */
  departmentName: string | null;
  state: string;
  phase: string;
  currentArrestSeq: number;
  patientUserId: string | null;
  triageRecordId: string | null;
  endedAt: Date | null;
  lastActivityAt: Date | null;
  startedAt: Date;
}

/** The episode header for the caller's hospital, or null. */
export async function loadHeader(
  scope: ResusScope,
  episodeId: string,
): Promise<EpisodeHeader | null> {
  const [row] = await db
    .select({
      id: resusEpisodes.id,
      hospitalId: resusEpisodes.hospitalId,
      departmentId: resusEpisodes.departmentId,
      departmentName: hospitalDepartments.name,
      state: resusEpisodes.state,
      phase: resusEpisodes.phase,
      currentArrestSeq: resusEpisodes.currentArrestSeq,
      patientUserId: resusEpisodes.patientUserId,
      triageRecordId: resusEpisodes.triageRecordId,
      endedAt: resusEpisodes.endedAt,
      lastActivityAt: resusEpisodes.lastActivityAt,
      startedAt: resusEpisodes.startedAt,
    })
    .from(resusEpisodes)
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, resusEpisodes.departmentId))
    .where(and(eq(resusEpisodes.id, episodeId), eq(resusEpisodes.hospitalId, scope.hospitalId)))
    .limit(1);
  return row ?? null;
}

/**
 * Scope + header + the active event view — the usual prelude of an action.
 * `rows` is the stored row count the checks are made on (commitResusEvents'
 * `expectRows`). `replay` is set when `clientEventId` already landed: a retry
 * returns the original result before any precondition (the first attempt has
 * already changed what those preconditions see).
 */
export async function prelude(
  episodeId: string,
  clientEventId?: string,
): Promise<
  | {
      ok: true;
      scope: ResusScope;
      header: EpisodeHeader;
      events: TimelineEvent[];
      rows: number;
      replay: Replay | null;
    }
  | { ok: false; error: string; signedOut?: boolean }
> {
  const scope = await resusScopeOrNull();
  if (!scope) return { ok: false, error: SIGNED_OUT, signedOut: true };
  const header = await loadHeader(scope, episodeId);
  if (!header) return { ok: false, error: "Resus episode not found in your hospital." };
  const all = await fetchAllResusEvents(episodeId);
  const landed = clientEventId ? all.find((e) => e.clientEventId === clientEventId) : undefined;
  return {
    ok: true,
    scope,
    header,
    events: reconstructTimeline(all),
    rows: all.length,
    replay: landed
      ? {
          ok: true,
          serverTime: new Date().toISOString(),
          eventIds: [landed.id],
          arrestSeq: landed.arrestSeq ?? null,
        }
      : null,
  };
}

/** The original result of a write that already landed (an idempotent retry). */
export interface Replay {
  ok: true;
  serverTime: string;
  eventIds: string[];
  arrestSeq: number | null;
}

/**
 * Patient age in whole years (null when unknown). Reads the date of birth only —
 * no name is decrypted, so no PHI-reveal row is written.
 */
export async function patientAgeYears(patientUserId: string | null): Promise<number | null> {
  if (!patientUserId) return null;
  const [p] = await db
    .select({ dob: patientProfiles.dateOfBirth })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, patientUserId))
    .limit(1);
  return p?.dob ? computeAgeYears(p.dob.toString(), new Date()) : null;
}

/** The user holds an active clinical affiliation at the hospital (who may hold a resus role). */
export async function isClinicalStaffAt(userId: string, hospitalId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: staffAffiliations.id })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(staffAffiliations.userId, userId),
        eq(staffAffiliations.hospitalId, hospitalId),
        eq(cadres.isClinical, true),
        inArray(staffAffiliations.state, ["active", "approved"]),
      ),
    )
    .limit(1);
  return !!row;
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
