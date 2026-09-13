import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions } from "@/db/schema/clinic-sessions";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { bookingAgents } from "@/db/schema/provisional-patients";
import { appointments } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";

/**
 * The household list (PRD §2.9, ADR 0089) as the agent sees it: the label
 * they typed and the relationship they declared — never the member's
 * encrypted name or phone, which the agent has no read path to. Adults only
 * at this gate; the writer (`pt-add-household-member`) refuses a minor.
 */
export interface HouseholdMember {
  bookingAgentId: string;
  provisionalPatientId: string;
  memberLabel: string;
  relationship: string;
  createdAtIso: string;
}

export async function fetchHousehold(agentUserId: string): Promise<HouseholdMember[]> {
  const rows = await db
    .select({
      bookingAgentId: bookingAgents.id,
      provisionalPatientId: bookingAgents.provisionalPatientId,
      memberLabel: bookingAgents.memberLabel,
      relationship: bookingAgents.relationship,
      createdAt: bookingAgents.createdAt,
    })
    .from(bookingAgents)
    .where(and(eq(bookingAgents.agentUserId, agentUserId), isNull(bookingAgents.revokedAt)))
    .orderBy(asc(bookingAgents.createdAt));
  return rows.flatMap((r) =>
    // A member who is a registered patient (patient_user_id) has no writer
    // yet; only provisional members exist at this gate.
    r.provisionalPatientId
      ? [
          {
            bookingAgentId: r.bookingAgentId,
            provisionalPatientId: r.provisionalPatientId,
            memberLabel: r.memberLabel,
            relationship: r.relationship,
            createdAtIso: r.createdAt.toISOString(),
          },
        ]
      : [],
  );
}

/**
 * A member's visit as the agent may see it — LOGISTICS ONLY (PRD §2.9):
 * date, place, service, code, status. No reason note, no clinician, no
 * clinical content. Mirrors the `appointments_select_agent` RLS policy:
 * only bookings this agent created.
 */
export interface HouseholdVisit {
  id: string;
  memberLabel: string;
  startsAtIso: string;
  status: string;
  hospitalName: string;
  departmentName: string;
  /** Null when the line is confidential — never named to an agent. */
  serviceName: string | null;
  bookingCode: string | null;
  positionNumber: number | null;
}

export async function fetchHouseholdVisits(
  agentUserId: string,
  members: ReadonlyArray<HouseholdMember>,
  limit = 30,
): Promise<HouseholdVisit[]> {
  if (members.length === 0) return [];
  const labelByProvisional = new Map(members.map((m) => [m.provisionalPatientId, m.memberLabel]));
  const rows = await db
    .select({
      id: appointments.id,
      provisionalPatientId: appointments.provisionalPatientId,
      startsAt: appointments.startsAt,
      status: appointments.status,
      hospitalName: hospitals.name,
      departmentName: hospitalDepartments.name,
      serviceName: serviceLines.name,
      confidential: serviceLines.confidential,
      bookingCode: appointments.bookingCode,
      positionNumber: appointments.positionNumber,
    })
    .from(appointments)
    .innerJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    // An appointment names its line only through a clinic day; a slot booking
    // names a department. The core refused a confidential line for a member
    // at booking time, so a slot row here is never confidential.
    .leftJoin(clinicSessions, eq(clinicSessions.id, appointments.sessionId))
    .leftJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
    .where(
      and(
        eq(appointments.createdByUserId, agentUserId),
        inArray(appointments.provisionalPatientId, [...labelByProvisional.keys()]),
      ),
    )
    .orderBy(desc(appointments.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    memberLabel: labelByProvisional.get(r.provisionalPatientId ?? "") ?? "A member",
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    hospitalName: r.hospitalName,
    departmentName: r.departmentName,
    serviceName: r.confidential ? null : r.serviceName,
    bookingCode: r.bookingCode,
    positionNumber: r.positionNumber,
  }));
}
