import "server-only";

import type { WardTab } from "./data";
import type { BedState, RoomKind, WardLayout } from "@/supabase/functions/_shared/ward-layout";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { patientIntakes } from "@/db/schema/patient-intakes";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { hospitalBeds } from "@/db/schema/services-hub";
import { users } from "@/db/schema/users";
import {
  bedAssignments,
  bedStateEvents,
  hospitalBedServices,
  wardLayouts,
} from "@/db/schema/ward-builder";
import { roomOfBed } from "@/supabase/functions/_shared/ward-layout";
import { openAssignments, wardTabs } from "./data";
import { parseLayout } from "./layout-schema";

/*
 * The live bed board's read (ADR 0194): the engine behind every occupancy figure. Occupied comes from
 * an open bed_assignments row, Out from the register, and Cleaning / Reserved / Free from the latest
 * bed_state_events row since the last assignment on that bed ended.
 */

/* ─── The live board ─────────────────────────────────────────────────── */

export interface BoardBed {
  key: string;
  bedId: string;
  label: string;
  state: BedState;
  since: string | null;
  reason: string | null;
  services: string[];
  roomKind: RoomKind | null;
  roomName: string | null;
  /** Only for viewers allowed to see it: the MRN, and the name for the ward's own staff. */
  patient: { name: string | null; mrn: string | null } | null;
  assignmentId: string | null;
}

export interface BoardCandidate {
  patientUserId: string;
  name: string | null;
  mrn: string | null;
  arrivedAt: string;
}

export interface BoardData {
  ward: { id: string; name: string; wardType: string | null; bedCount: number };
  tabs: WardTab[];
  doc: WardLayout | null;
  published: { version: number; publishedAt: string } | null;
  beds: BoardBed[];
  candidates: BoardCandidate[];
}

const WAITING_INTAKE = ["arrived", "awaiting_triage", "triaged"];

/**
 * The published plan with every bed's state (ADR 0194 §1): Occupied from an open assignment, Out from
 * the register, else the latest state event since the last assignment ended, else Free. `viewer`
 * decides what of a patient is shown: `names` for the ward's own staff, MRN only otherwise.
 */
export async function loadBedBoard(
  hospitalId: string,
  wardId: string,
  viewer: { patients: "none" | "mrn" | "names"; tabs?: WardTab[] },
): Promise<BoardData | null> {
  const [ward] = await db
    .select({
      id: hospitalWards.id,
      name: hospitalWards.name,
      wardType: hospitalWards.wardType,
      bedCount: hospitalWards.bedCount,
      archivedAt: hospitalWards.archivedAt,
    })
    .from(hospitalWards)
    .where(and(eq(hospitalWards.id, wardId), eq(hospitalWards.hospitalId, hospitalId)));
  if (!ward || ward.archivedAt) return null;
  const [tabs, [pub], beds, open] = await Promise.all([
    viewer.tabs ? Promise.resolve(viewer.tabs) : wardTabs(hospitalId),
    db
      .select({
        version: wardLayouts.version,
        document: wardLayouts.document,
        publishedAt: wardLayouts.publishedAt,
      })
      .from(wardLayouts)
      .where(
        and(
          eq(wardLayouts.hospitalId, hospitalId),
          eq(wardLayouts.wardId, wardId),
          eq(wardLayouts.state, "published"),
        ),
      ),
    db
      .select({ id: hospitalBeds.id, label: hospitalBeds.label, closedAt: hospitalBeds.closedAt })
      .from(hospitalBeds)
      .where(
        and(
          eq(hospitalBeds.hospitalId, hospitalId),
          eq(hospitalBeds.wardId, wardId),
          isNull(hospitalBeds.archivedAt),
        ),
      ),
    openAssignments(hospitalId, wardId),
  ]);
  const base = {
    ward: { id: ward.id, name: ward.name, wardType: ward.wardType, bedCount: ward.bedCount },
    tabs,
  };
  const parsed = pub ? parseLayout(pub.document) : null;
  if (!pub || !parsed?.ok) return { ...base, doc: null, published: null, beds: [], candidates: [] };
  const doc = parsed.doc;
  const ids = beds.map((b) => b.id);
  const [services, ended, latest] = ids.length
    ? await Promise.all([
        db
          .select({ bedId: hospitalBedServices.bedId, code: hospitalBedServices.serviceCode })
          .from(hospitalBedServices)
          .where(inArray(hospitalBedServices.bedId, ids)),
        db
          .select({
            bedId: bedAssignments.bedId,
            lastEndedAt: sql<string>`max(${bedAssignments.endedAt})`.mapWith(String),
          })
          .from(bedAssignments)
          .where(and(inArray(bedAssignments.bedId, ids), isNotNull(bedAssignments.endedAt)))
          .groupBy(bedAssignments.bedId),
        db
          .selectDistinctOn([bedStateEvents.bedId], {
            bedId: bedStateEvents.bedId,
            state: bedStateEvents.state,
            reason: bedStateEvents.reason,
            setAt: bedStateEvents.setAt,
          })
          .from(bedStateEvents)
          .where(inArray(bedStateEvents.bedId, ids))
          .orderBy(bedStateEvents.bedId, desc(bedStateEvents.setAt)),
      ])
    : [[], [], []];

  const people =
    viewer.patients !== "none" && open.length
      ? await db
          .select({
            id: patientProfiles.id,
            mrn: patientProfiles.patientCode,
            name: users.fullName,
          })
          .from(patientProfiles)
          .leftJoin(users, eq(users.id, patientProfiles.id))
          .where(
            inArray(
              patientProfiles.id,
              open.map((a) => a.patientUserId),
            ),
          )
      : [];

  const byBed = new Map(beds.map((b) => [b.id, b]));
  const stateOf = (bedId: string) => {
    const bed = byBed.get(bedId);
    const a = open.find((x) => x.bedId === bedId);
    if (a) return { state: "occupied" as const, since: a.startedAt.toISOString(), reason: null, a };
    if (!bed || bed.closedAt)
      return {
        state: "out" as const,
        since: bed?.closedAt?.toISOString() ?? null,
        reason: null,
        a: null,
      };
    const lastEnded = ended.find((e) => e.bedId === bedId)?.lastEndedAt ?? null;
    const ev = latest.find((e) => e.bedId === bedId);
    if (ev && (lastEnded === null || ev.setAt.getTime() >= Date.parse(lastEnded)))
      return {
        state: ev.state as BedState,
        since: ev.setAt.toISOString(),
        reason: ev.reason,
        a: null,
      };
    return { state: "free" as const, since: lastEnded, reason: null, a: null };
  };

  const boardBeds: BoardBed[] = doc.beds
    .filter((b) => b.bedId && byBed.has(b.bedId))
    .map((b) => {
      const s = stateOf(b.bedId!);
      const room = roomOfBed(b, doc.rooms);
      const p = s.a ? people.find((x) => x.id === s.a!.patientUserId) : undefined;
      return {
        key: b.key,
        bedId: b.bedId!,
        label: byBed.get(b.bedId!)!.label,
        state: s.state,
        since: s.since,
        reason: s.reason,
        services: services.filter((x) => x.bedId === b.bedId).map((x) => x.code),
        roomKind: room?.kind ?? null,
        roomName: room?.name ?? null,
        patient:
          s.a && viewer.patients !== "none"
            ? { name: viewer.patients === "names" ? (p?.name ?? null) : null, mrn: p?.mrn ?? null }
            : null,
        assignmentId: s.a?.id ?? null,
      };
    });

  // Patients sent to this ward who have no bed yet (ADR 0194 §4).
  const waiting =
    viewer.patients === "none"
      ? []
      : await db
          .select({
            patientUserId: patientIntakes.patientUserId,
            arrivedAt: patientIntakes.arrivedAt,
            mrn: patientProfiles.patientCode,
            name: users.fullName,
          })
          .from(patientIntakes)
          .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
          .leftJoin(users, eq(users.id, patientIntakes.patientUserId))
          .where(
            and(
              eq(patientIntakes.hospitalId, hospitalId),
              eq(patientIntakes.receivingWardId, wardId),
              inArray(patientIntakes.status, WAITING_INTAKE),
              isNotNull(patientIntakes.patientUserId),
              sql`NOT EXISTS (SELECT 1 FROM public.bed_assignments a
                               WHERE a.patient_user_id = ${patientIntakes.patientUserId} AND a.ended_at IS NULL)`,
            ),
          )
          .orderBy(asc(patientIntakes.arrivedAt))
          .limit(50);
  const seen = new Set<string>();
  const candidates: BoardCandidate[] = [];
  for (const c of waiting) {
    if (!c.patientUserId || seen.has(c.patientUserId)) continue;
    seen.add(c.patientUserId);
    candidates.push({
      patientUserId: c.patientUserId,
      name: viewer.patients === "names" ? c.name : null,
      mrn: c.mrn,
      arrivedAt: c.arrivedAt.toISOString(),
    });
  }

  return {
    ...base,
    doc,
    published: {
      version: pub.version,
      publishedAt: (pub.publishedAt ?? new Date()).toISOString(),
    },
    beds: boardBeds,
    candidates,
  };
}
