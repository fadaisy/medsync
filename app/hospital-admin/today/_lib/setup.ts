import "server-only";

import type { SetupFacts } from "@/lib/hospital-admin/guide/setup";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { scheduleVersions } from "@/db/schema/clinics-schedule";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalStaffInvitations } from "@/db/schema/hospital-staff-invitations";
import { hospitals } from "@/db/schema/hospitals";
import { deskDevices } from "@/db/schema/reception-desk";
import { serviceLines } from "@/db/schema/service-lines";
import { routingIsSet } from "@/lib/hospital-admin/guide/setup";
import { loadCapabilities } from "@/lib/services/data";
import { capabilityKey } from "@/supabase/functions/_shared/services-hub";

/** A fact that cannot be read is null, never false or true (ADR 0522: To do, never a guessed Done). */
const soft = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

const any = (rows: readonly unknown[]) => rows.length > 0;

/**
 * "Set up Tether" on Today (ADR 0522): what this hospital's records say, each read on its own and scoped to the
 * hospital. Read-only; existence checks with `limit 1`. A table not yet migrated reads as null.
 */
export async function loadSetupFacts(hospitalId: string): Promise<SetupFacts> {
  const [departmentLive, invitationSent, place, caps, clinicOpen, weekPublished, devicePaired] =
    await Promise.all([
      soft(
        db
          .select({ id: hospitalDepartments.id })
          .from(hospitalDepartments)
          .where(
            and(
              eq(hospitalDepartments.hospitalId, hospitalId),
              isNotNull(hospitalDepartments.medsyncLiveAt),
              isNull(hospitalDepartments.archivedAt),
            ),
          )
          .limit(1)
          .then(any),
      ),
      soft(
        db
          .select({ id: hospitalStaffInvitations.id })
          .from(hospitalStaffInvitations)
          .where(eq(hospitalStaffInvitations.hospitalId, hospitalId))
          .limit(1)
          .then(any),
      ),
      soft(
        db
          .select({ lat: hospitals.latitude, lng: hospitals.longitude })
          .from(hospitals)
          .where(eq(hospitals.id, hospitalId))
          .limit(1)
          .then((r) => (r[0] ? r[0].lat !== null && r[0].lng !== null : null)),
      ),
      soft(loadCapabilities(hospitalId)),
      soft(
        db
          .select({ id: serviceLines.id })
          .from(serviceLines)
          .where(
            and(
              eq(serviceLines.hospitalId, hospitalId),
              eq(serviceLines.active, true),
              isNull(serviceLines.archivedAt),
              isNull(serviceLines.pausedAt),
            ),
          )
          .limit(1)
          .then(any),
      ),
      soft(
        db
          .select({ id: scheduleVersions.id })
          .from(scheduleVersions)
          .where(eq(scheduleVersions.hospitalId, hospitalId))
          .limit(1)
          .then(any),
      ),
      soft(
        db
          .select({ id: deskDevices.id })
          .from(deskDevices)
          .where(
            and(
              eq(deskDevices.hospitalId, hospitalId),
              or(isNotNull(deskDevices.pairCodeUsedAt), isNotNull(deskDevices.lastSeenAt)),
            ),
          )
          .limit(1)
          .then(any),
      ),
    ]);
  return {
    departmentLive,
    invitationSent,
    located: place,
    routing:
      caps === null
        ? null
        : routingIsSet(
            caps.map((c) => ({
              key: c.key,
              routing: capabilityKey(c.key)?.routing ?? false,
              derived: c.derived,
              value: c.value,
              pending: c.pending,
              verified: c.verified,
            })),
          ),
    clinicOpen,
    weekPublished,
    devicePaired,
  };
}
