/**
 * FHIR R4 Appointment mapping — at the API boundary only (PRD §4.3, proposal
 * §6, ADR 0089). MedSync stores its own statuses; nothing FHIR is stored,
 * and no route exposes this until a consumer exists (the DHIS2 seam stays
 * clean).
 *
 * ZERO imports, in the shape of `_shared/slots.ts`, so Next, Deno and RN
 * can all import it. The row shape is declared here in camelCase; a Drizzle
 * `Appointment` satisfies it, and a supabase-js row does after aliasing.
 *
 * Versioned: `FHIR_PROFILE` names the target. An R5/R6 profile is a second
 * map beside this one selected by configuration, not a rewrite.
 *
 * Status map (the actual `appointments_status_check`, migration 0060):
 *
 *   requested, pending_approval      → pending
 *   confirmed                        → booked
 *   arrived                          → arrived, or checked-in when DERIVED
 *   in_progress, completed           → fulfilled
 *   cancelled, declined, rescheduled → cancelled (`rescheduled` is the OLD
 *                                      row of a reschedule; `replaces` on
 *                                      the new row points back at it)
 *   no_show                          → noshow
 *   void                             → entered-in-error
 *   (a waitlist row, no appointment) → waitlist — DERIVED from
 *                                      `waitlist_entries`, which does not
 *                                      exist yet (Gate E); the input is a stub
 *
 * checked-in is derived, never stored: `arrived` AND a `patient_intakes` row
 * exists for the appointment AND, when the booking was provisional, the desk
 * reconciled it (`confirmed` | `created`). Not `checked_in_at` — that column
 * is set only on the declared open-queue path.
 *
 * `tests/fhir/appointment-r4.test.ts` asserts every value of the schema's
 * `APPOINTMENT_STATUSES` maps, so a CHECK widening without a mapping fails
 * the test run.
 */

export const FHIR_PROFILE = "r4" as const;

/** The stored vocabulary — mirror of `appointments_status_check`. */
export type MedSyncAppointmentStatus =
  | "requested"
  | "pending_approval"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled"
  | "declined"
  | "void";

/** FHIR R4 AppointmentStatus value set. */
export type FhirAppointmentStatus =
  | "proposed"
  | "pending"
  | "booked"
  | "arrived"
  | "fulfilled"
  | "cancelled"
  | "noshow"
  | "entered-in-error"
  | "checked-in"
  | "waitlist";

export type Instant = Date | string;

/** The columns the mapper reads. A Drizzle `Appointment` satisfies it. */
export interface FhirAppointmentRow {
  id: string;
  status: string;
  startsAt: Instant;
  endsAt: Instant;
  hospitalId: string;
  clinicianUserId: string;
  /** NULL for a provisional booking not yet reconciled. */
  patientUserId: string | null;
  provisionalPatientId?: string | null;
  rescheduledFromAppointmentId?: string | null;
  reason?: string | null;
}

export interface FhirMapContext {
  /** A `patient_intakes` row exists for this appointment (the desk-verified signal). */
  intakeExists?: boolean;
  /** `provisional_patients.reconciliation_state` when the booking is provisional. */
  provisionalState?: "unreconciled" | "confirmed" | "created" | "rejected" | null;
  /** The service line, for `serviceType`. */
  serviceLine?: { id: string; name: string } | null;
  /**
   * STUB for Gate E: a `waitlist_entries` row in `waiting` | `offered` has no
   * appointment and maps to a FHIR Appointment with status `waitlist`. Pass
   * it instead of a row once the table exists.
   */
  waitlist?: { id: string; state: "waiting" | "offered" | string } | null;
}

export function toFhirAppointmentStatus(
  status: string,
  ctx: FhirMapContext = {},
): FhirAppointmentStatus {
  const s = status as MedSyncAppointmentStatus;
  switch (s) {
    case "requested":
    case "pending_approval":
      return "pending";
    case "confirmed":
      return "booked";
    case "arrived": {
      const reconciled =
        ctx.provisionalState == null ||
        ctx.provisionalState === "confirmed" ||
        ctx.provisionalState === "created";
      return ctx.intakeExists && reconciled ? "checked-in" : "arrived";
    }
    case "in_progress":
    case "completed":
      return "fulfilled";
    case "cancelled":
    case "declined":
    case "rescheduled":
      return "cancelled";
    case "no_show":
      return "noshow";
    case "void":
      return "entered-in-error";
    default: {
      // A CHECK widening without a mapping lands here, at the boundary, loudly.
      const unmapped: never = s;
      throw new Error(`No FHIR mapping for appointments.status '${String(unmapped)}'`);
    }
  }
}

/** The minimal R4 Appointment resource. */
export interface FhirAppointment {
  resourceType: "Appointment";
  id: string;
  meta: { profile: string[] };
  status: FhirAppointmentStatus;
  start?: string;
  end?: string;
  serviceType?: { coding: { system: string; code: string; display: string }[] }[];
  participant: {
    actor: { reference: string; display?: string };
    status: "accepted" | "needs-action";
  }[];
  replaces?: { reference: string }[];
}

const SERVICE_TYPE_SYSTEM = "https://medsync.health/fhir/CodeSystem/service-line";

const toIso = (i: Instant) => (i instanceof Date ? i : new Date(i)).toISOString();

/**
 * Map one row. Pass `ctx.waitlist` INSTEAD of a real row to emit a
 * `waitlist` Appointment (the row's status is then ignored).
 */
export function toFhirAppointment(
  row: FhirAppointmentRow,
  ctx: FhirMapContext = {},
): FhirAppointment {
  const participant: FhirAppointment["participant"] = [];
  if (row.patientUserId) {
    participant.push({ actor: { reference: `Patient/${row.patientUserId}` }, status: "accepted" });
  } else if (row.provisionalPatientId) {
    // A provisional booking has no Patient resource: the desk has not
    // reconciled it (PRD §2.8). The reference is to the provisional record.
    participant.push({
      actor: { reference: `Patient/provisional/${row.provisionalPatientId}` },
      status: "needs-action",
    });
  }
  participant.push({
    actor: { reference: `PractitionerRole/${row.clinicianUserId}` },
    status: "accepted",
  });
  participant.push({ actor: { reference: `Location/${row.hospitalId}` }, status: "accepted" });

  const resource: FhirAppointment = {
    resourceType: "Appointment",
    id: row.id,
    meta: { profile: [`https://medsync.health/fhir/${FHIR_PROFILE}/Appointment`] },
    status: ctx.waitlist ? "waitlist" : toFhirAppointmentStatus(row.status, ctx),
    start: toIso(row.startsAt),
    end: toIso(row.endsAt),
    participant,
  };
  if (ctx.serviceLine) {
    resource.serviceType = [
      {
        coding: [
          { system: SERVICE_TYPE_SYSTEM, code: ctx.serviceLine.id, display: ctx.serviceLine.name },
        ],
      },
    ];
  }
  if (row.rescheduledFromAppointmentId) {
    resource.replaces = [{ reference: `Appointment/${row.rescheduledFromAppointmentId}` }];
  }
  return resource;
}
