import { readFileSync } from "node:fs";
import type { FhirAppointmentStatus } from "@/lib/fhir/appointment-r4";
import { describe, expect, it } from "vitest";

import { APPOINTMENT_STATUSES } from "@/db/schema/scheduling";
import {
  FHIR_PROFILE,
  toFhirAppointment,
  toFhirAppointmentStatus,
} from "@/lib/fhir/appointment-r4";

/**
 * Proposal §6 / ADR 0089: every value the CHECK admits maps, and the two
 * derived states (checked-in, waitlist) come from evidence, not storage.
 */
const R4: ReadonlySet<FhirAppointmentStatus> = new Set([
  "proposed",
  "pending",
  "booked",
  "arrived",
  "fulfilled",
  "cancelled",
  "noshow",
  "entered-in-error",
  "checked-in",
  "waitlist",
]);

const ROW = {
  id: "a1",
  status: "confirmed",
  startsAt: "2026-09-22T06:30:00Z",
  endsAt: "2026-09-22T07:00:00Z",
  hospitalId: "h1",
  clinicianUserId: "c1",
  patientUserId: "p1",
};

describe("toFhirAppointmentStatus", () => {
  it("the schema's list IS migration 0060's appointments_status_check (incl. void)", () => {
    const sql = readFileSync("supabase/migrations/0060_identity_and_lifecycle.sql", "utf8");
    const start = sql.lastIndexOf("appointments_status_check CHECK");
    const check = sql.slice(start, sql.indexOf(";", start));
    const inDb = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...APPOINTMENT_STATUSES].sort());
    expect(inDb).toContain("void");
  });

  it("maps EVERY status in the schema's CHECK to a value of the R4 value set", () => {
    for (const status of APPOINTMENT_STATUSES) {
      expect(R4.has(toFhirAppointmentStatus(status)), status).toBe(true);
    }
  });

  it("throws on a status the map does not know — a CHECK widening cannot go unmapped", () => {
    expect(() => toFhirAppointmentStatus("held")).toThrow(/No FHIR mapping/);
  });

  it("the fixed pairs", () => {
    expect(toFhirAppointmentStatus("requested")).toBe("pending");
    expect(toFhirAppointmentStatus("pending_approval")).toBe("pending");
    expect(toFhirAppointmentStatus("confirmed")).toBe("booked");
    expect(toFhirAppointmentStatus("in_progress")).toBe("fulfilled");
    expect(toFhirAppointmentStatus("completed")).toBe("fulfilled");
    expect(toFhirAppointmentStatus("cancelled")).toBe("cancelled");
    expect(toFhirAppointmentStatus("declined")).toBe("cancelled");
    expect(toFhirAppointmentStatus("rescheduled")).toBe("cancelled");
    expect(toFhirAppointmentStatus("no_show")).toBe("noshow");
    expect(toFhirAppointmentStatus("void")).toBe("entered-in-error");
  });

  it("checked-in is DERIVED: arrived + an intake row + (when provisional) reconciled", () => {
    expect(toFhirAppointmentStatus("arrived")).toBe("arrived");
    expect(toFhirAppointmentStatus("arrived", { intakeExists: true })).toBe("checked-in");
    expect(
      toFhirAppointmentStatus("arrived", { intakeExists: true, provisionalState: "unreconciled" }),
    ).toBe("arrived");
    expect(
      toFhirAppointmentStatus("arrived", { intakeExists: true, provisionalState: "rejected" }),
    ).toBe("arrived");
    expect(
      toFhirAppointmentStatus("arrived", { intakeExists: true, provisionalState: "confirmed" }),
    ).toBe("checked-in");
    expect(
      toFhirAppointmentStatus("arrived", { intakeExists: true, provisionalState: "created" }),
    ).toBe("checked-in");
    // An intake alone never promotes a non-arrived row.
    expect(toFhirAppointmentStatus("confirmed", { intakeExists: true })).toBe("booked");
  });
});

describe("toFhirAppointment", () => {
  it("is versioned and carries Patient, PractitionerRole and Location participants", () => {
    expect(FHIR_PROFILE).toBe("r4");
    const r = toFhirAppointment(ROW, { serviceLine: { id: "l1", name: "Diabetes Clinic" } });
    expect(r.resourceType).toBe("Appointment");
    expect(r.meta.profile[0]).toContain("/r4/");
    expect(r.status).toBe("booked");
    expect(r.start).toBe("2026-09-22T06:30:00.000Z");
    expect(r.participant.map((p) => p.actor.reference)).toEqual([
      "Patient/p1",
      "PractitionerRole/c1",
      "Location/h1",
    ]);
    expect(r.serviceType?.[0]?.coding[0]).toMatchObject({ code: "l1", display: "Diabetes Clinic" });
    expect(r.replaces).toBeUndefined();
  });

  it("a provisional booking has no Patient — a needs-action provisional reference instead", () => {
    const r = toFhirAppointment({ ...ROW, patientUserId: null, provisionalPatientId: "pp1" });
    expect(r.participant[0]).toEqual({
      actor: { reference: "Patient/provisional/pp1" },
      status: "needs-action",
    });
  });

  it("a rescheduled chain: the new row `replaces` the old one", () => {
    const r = toFhirAppointment({ ...ROW, rescheduledFromAppointmentId: "a0" });
    expect(r.replaces).toEqual([{ reference: "Appointment/a0" }]);
  });

  it("waitlist is derived from a waitlist row (stub until Gate E), whatever the status says", () => {
    const r = toFhirAppointment(ROW, { waitlist: { id: "w1", state: "waiting" } });
    expect(r.status).toBe("waitlist");
  });
});
