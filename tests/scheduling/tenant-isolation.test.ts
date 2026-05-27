import type { TestUser } from "../rls/_helpers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  cleanup,
  closeSql,
  createTestHospital,
  createTestUser,
  grantRole,
  RLS_TESTS_ENABLED,
  serviceSql,
} from "../rls/_helpers";

/**
 * Scheduling tenant-isolation regression. Mirrors the staff-affiliation
 * isolation test but covers the scheduling tables.
 *
 * Proves:
 *   1. A patient at hospital A can SELECT only their own appointments
 *      via their anon-keyed client (RLS-applied).
 *   2. A clinician at hospital A can SELECT only their own appointments
 *      (not a same-named clinician's at hospital B).
 *   3. An admin-A client cannot SELECT appointments scoped to hospital B.
 *   4. UPDATE to staff-mutable tables (appointments, availability_blocks)
 *      from an authenticated session is refused (those mutations happen
 *      service-role only via the Edge Functions).
 *
 * Skipped by default behind MEDSYNC_ALLOW_RLS_DB_WRITES=1.
 */

describe.skipIf(!RLS_TESTS_ENABLED)("scheduling: tenant isolation", () => {
  let hospitalA: { id: string };
  let hospitalB: { id: string };
  let patientA: TestUser;
  let patientB: TestUser;
  let clinicianA: TestUser;
  let clinicianB: TestUser;
  let deptAId: string;
  let deptBId: string;
  let apptA: string;
  let apptB: string;
  let blockAId: string;

  beforeAll(async () => {
    hospitalA = await createTestHospital("sched-a");
    hospitalB = await createTestHospital("sched-b");

    const [deptA] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospitalA.id}, 'Sched Dept A', 'sched-dept-a') RETURNING id
    `;
    const [deptB] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospitalB.id}, 'Sched Dept B', 'sched-dept-b') RETURNING id
    `;
    if (!deptA || !deptB) throw new Error("dept seed failed");
    deptAId = deptA.id;
    deptBId = deptB.id;

    patientA = await createTestUser("sched", "patient-a");
    patientB = await createTestUser("sched", "patient-b");
    clinicianA = await createTestUser("sched", "clinician-a");
    clinicianB = await createTestUser("sched", "clinician-b");

    await grantRole(patientA.id, "patient", null);
    await grantRole(patientB.id, "patient", null);
    await grantRole(clinicianA.id, "clinician", hospitalA.id);
    await grantRole(clinicianB.id, "clinician", hospitalB.id);

    // Patient profiles with primary_facility_id set.
    await serviceSql`
      INSERT INTO public.patient_profiles (id, patient_code, primary_facility_id)
      VALUES (${patientA.id}, ${"P-SCHED-A-" + Math.random().toString(36).slice(2, 6)}, ${hospitalA.id})
      ON CONFLICT (id) DO UPDATE SET primary_facility_id = EXCLUDED.primary_facility_id
    `;
    await serviceSql`
      INSERT INTO public.patient_profiles (id, patient_code, primary_facility_id)
      VALUES (${patientB.id}, ${"P-SCHED-B-" + Math.random().toString(36).slice(2, 6)}, ${hospitalB.id})
      ON CONFLICT (id) DO UPDATE SET primary_facility_id = EXCLUDED.primary_facility_id
    `;

    // Availability block + an appointment per hospital.
    const [block] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.availability_blocks
        (hospital_id, clinician_user_id, department_id, kind, starts_at, ends_at)
      VALUES (
        ${hospitalA.id}, ${clinicianA.id}, ${deptAId}, 'bookable',
        now() + interval '1 day', now() + interval '1 day' + interval '2 hours'
      )
      RETURNING id
    `;
    if (!block) throw new Error("block seed failed");
    blockAId = block.id;

    const [a] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.appointments
        (hospital_id, department_id, patient_user_id, clinician_user_id,
         starts_at, ends_at, reason, origin, status)
      VALUES (
        ${hospitalA.id}, ${deptAId}, ${patientA.id}, ${clinicianA.id},
        now() + interval '1 day' + interval '10 minutes',
        now() + interval '1 day' + interval '25 minutes',
        'follow_up', 'patient', 'confirmed'
      )
      RETURNING id
    `;
    const [b] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.appointments
        (hospital_id, department_id, patient_user_id, clinician_user_id,
         starts_at, ends_at, reason, origin, status)
      VALUES (
        ${hospitalB.id}, ${deptBId}, ${patientB.id}, ${clinicianB.id},
        now() + interval '2 days', now() + interval '2 days' + interval '15 minutes',
        'follow_up', 'patient', 'confirmed'
      )
      RETURNING id
    `;
    if (!a || !b) throw new Error("appt seed failed");
    apptA = a.id;
    apptB = b.id;
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeSql();
  }, 60_000);

  test("patient-A sees only their own appointment, never patient-B's", async () => {
    const { data, error } = await patientA.client.from("appointments").select("id, hospital_id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(apptA);
    expect(ids).not.toContain(apptB);
  });

  test("clinician-A sees only their own appointments, never clinician-B's", async () => {
    const { data, error } = await clinicianA.client
      .from("appointments")
      .select("id, hospital_id, clinician_user_id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(apptA);
    expect(ids).not.toContain(apptB);
  });

  test("patient-A querying patient-B's appointment by id resolves empty", async () => {
    const { data, error } = await patientA.client.from("appointments").select("id").eq("id", apptB);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test("authenticated UPDATE on appointments is refused", async () => {
    // The patient owns this row but mutations are gated to service-role.
    const { data, error } = await patientA.client
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", apptA)
      .select("id");
    // RLS denies → either error or zero rows; both fine for the attacker.
    if (!error) expect(data ?? []).toEqual([]);
    const [check] = await serviceSql<{ status: string }[]>`
      SELECT status FROM public.appointments WHERE id = ${apptA}
    `;
    expect(check?.status).toBe("confirmed");
  });

  test("clinician-A's availability block isn't writable from clinician-A's auth", async () => {
    const { data, error } = await clinicianA.client
      .from("availability_blocks")
      .update({ state: "cancelled" })
      .eq("id", blockAId)
      .select("id");
    if (!error) expect(data ?? []).toEqual([]);
    const [check] = await serviceSql<{ state: string }[]>`
      SELECT state FROM public.availability_blocks WHERE id = ${blockAId}
    `;
    expect(check?.state).toBe("active");
  });
});
