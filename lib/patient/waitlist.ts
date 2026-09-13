import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { notificationDispatches, waitlistEntries } from "@/db/schema/notifications";
import { provisionalPatients } from "@/db/schema/provisional-patients";
import { serviceLines } from "@/db/schema/service-lines";
import { decrypt } from "@/lib/encryption";

/**
 * Waitlist + cancelled-day reads for the patient's Visits page (Gate E,
 * ADR 0090). The patient's own entries and the ones they created as a
 * booking agent (PRD §2.9) — the same two RLS clauses, restated for the
 * service-role read.
 */

export interface WaitlistCard {
  id: string;
  /** 'waiting' | 'offered' */
  state: string;
  serviceLineName: string;
  hospitalName: string;
  preferredFrom: string;
  preferredTo: string | null;
  /** Set on an `offered` entry. */
  offeredStartsAtIso: string | null;
  offerExpiresAtIso: string | null;
  /** The household member's declared name when the entry is for them, else null (it is the patient's own). */
  memberName: string | null;
}

export async function fetchWaitlist(userId: string): Promise<WaitlistCard[]> {
  const rows = await db
    .select({
      id: waitlistEntries.id,
      state: waitlistEntries.state,
      serviceLineName: serviceLines.name,
      hospitalName: hospitals.name,
      preferredFrom: waitlistEntries.preferredFrom,
      preferredTo: waitlistEntries.preferredTo,
      offeredStartsAt: waitlistEntries.offeredStartsAt,
      offerExpiresAt: waitlistEntries.offerExpiresAt,
      memberNameEncrypted: provisionalPatients.declaredNameEncrypted,
    })
    .from(waitlistEntries)
    .innerJoin(serviceLines, eq(serviceLines.id, waitlistEntries.serviceLineId))
    .innerJoin(hospitals, eq(hospitals.id, waitlistEntries.hospitalId))
    .leftJoin(provisionalPatients, eq(provisionalPatients.id, waitlistEntries.provisionalPatientId))
    .where(
      and(
        or(eq(waitlistEntries.patientUserId, userId), eq(waitlistEntries.createdByUserId, userId)),
        inArray(waitlistEntries.state, ["waiting", "offered"]),
      ),
    )
    .orderBy(asc(waitlistEntries.createdAt));
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    serviceLineName: r.serviceLineName,
    hospitalName: r.hospitalName,
    preferredFrom: r.preferredFrom,
    preferredTo: r.preferredTo,
    offeredStartsAtIso: r.offeredStartsAt?.toISOString() ?? null,
    offerExpiresAtIso: r.offerExpiresAt?.toISOString() ?? null,
    memberName: r.memberNameEncrypted ? safeDecrypt(r.memberNameEncrypted) : null,
  }));
}

/**
 * The pre-selected next clinic day for each visit the clinic cancelled —
 * exactly what the `session_cancelled` dispatch told the patient, read back
 * from its payload so the card and the message agree.
 */
export async function fetchRebookingOffers(
  cancelledAppointmentIds: ReadonlyArray<string>,
): Promise<Map<string, { nextSessionId: string; nextSessionStartsAtIso: string } | null>> {
  const out = new Map<string, { nextSessionId: string; nextSessionStartsAtIso: string } | null>();
  if (cancelledAppointmentIds.length === 0) return out;
  const rows = await db
    .select({
      relatedId: notificationDispatches.relatedId,
      payload: notificationDispatches.payload,
    })
    .from(notificationDispatches)
    .where(
      and(
        eq(notificationDispatches.kind, "session_cancelled"),
        eq(notificationDispatches.relatedKind, "appointment"),
        inArray(notificationDispatches.relatedId, [...cancelledAppointmentIds]),
      ),
    );
  for (const r of rows) {
    const p = r.payload as {
      next_session_id?: string | null;
      next_session_starts_at?: string | null;
    };
    out.set(
      r.relatedId,
      p.next_session_id && p.next_session_starts_at
        ? { nextSessionId: p.next_session_id, nextSessionStartsAtIso: p.next_session_starts_at }
        : null,
    );
  }
  return out;
}

function safeDecrypt(ciphertext: string): string | null {
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}
