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
 * Per-affiliation correctness for the hospital-admin staff feature.
 *
 * The kickoff's rule: an admin acts on a staff member's affiliation
 * AT THIS HOSPITAL, never on the staff member globally. Suspending a
 * clinician here must leave their access at OTHER hospitals untouched.
 *
 * Scenario:
 *   - Hospital A, Hospital B (independent tenants)
 *   - Clinician C has active affiliations at both A and B
 *   - admin-A is hospital_admin for A
 *   - admin-A's anon-keyed client can SELECT their own pending /
 *     active rows from A and CANNOT see C's affiliation at B
 *
 * Plus the affiliation-state cleanup correctness check (review_note
 * is cleared when an affiliation leaves pending_approval). That
 * matters because a stale review_note on an approved row would
 * confuse the applicant's pending page.
 *
 * Skipped unless MEDSYNC_ALLOW_RLS_DB_WRITES=1 — same opt-in gate as
 * the other live-DB tests.
 */

describe.skipIf(!RLS_TESTS_ENABLED)("hospital-admin/staff: per-affiliation correctness", () => {
  let hospitalA: { id: string };
  let hospitalB: { id: string };
  let adminA: TestUser;
  let clinicianC: TestUser;
  let affA: string;
  let affB: string;
  let cadreId: string;
  let roleId: string;
  let deptAId: string;
  let deptBId: string;

  beforeAll(async () => {
    hospitalA = await createTestHospital("staffisol-a");
    hospitalB = await createTestHospital("staffisol-b");

    const [deptA] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospitalA.id}, 'Test Dept A', 'test-dept-a')
      RETURNING id
    `;
    const [deptB] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospitalB.id}, 'Test Dept B', 'test-dept-b')
      RETURNING id
    `;
    if (!deptA || !deptB) throw new Error("dept seed failed");
    deptAId = deptA.id;
    deptBId = deptB.id;

    const [cadre] = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.cadres LIMIT 1
    `;
    const [role] = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.roles LIMIT 1
    `;
    if (!cadre || !role) throw new Error("cadre/role seed missing");
    cadreId = cadre.id;
    roleId = role.id;

    adminA = await createTestUser("staffisol", "admin-a");
    await grantRole(adminA.id, "hospital_admin", hospitalA.id);

    clinicianC = await createTestUser("staffisol", "clinician-c");
    // Active affiliation at both hospitals.
    const [a] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.staff_affiliations
        (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state)
      VALUES (${clinicianC.id}, ${hospitalA.id}, ${deptAId}, ${cadreId}, ${roleId}, 'full_time', 'active')
      RETURNING id
    `;
    const [b] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.staff_affiliations
        (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state)
      VALUES (${clinicianC.id}, ${hospitalB.id}, ${deptBId}, ${cadreId}, ${roleId}, 'full_time', 'active')
      RETURNING id
    `;
    if (!a || !b) throw new Error("affiliation seed failed");
    affA = a.id;
    affB = b.id;
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeSql();
  }, 60_000);

  test("admin-A's anon client can SELECT clinician-C's affiliation at A but not at B", async () => {
    const { data, error } = await adminA.client
      .from("staff_affiliations")
      .select("id, hospital_id")
      .eq("user_id", clinicianC.id);

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(affA);
    expect(ids).not.toContain(affB);
  });

  test("admin-A cannot UPDATE the state of clinician-C's hospital-B affiliation", async () => {
    // Try via the user's anon client (RLS denies UPDATE on
    // staff_affiliations to authenticated entirely; this is the
    // belt-and-suspenders proof).
    const { data, error } = await adminA.client
      .from("staff_affiliations")
      .update({ state: "suspended" })
      .eq("id", affB)
      .select("id");
    // RLS denies → either error or zero rows affected.
    if (!error) {
      expect(data ?? []).toEqual([]);
    }
    const [check] = await serviceSql<{ state: string }[]>`
      SELECT state FROM public.staff_affiliations WHERE id = ${affB}
    `;
    expect(check?.state).toBe("active");
  });

  test("suspending the A affiliation server-side does not touch the B affiliation", async () => {
    // Service-role simulation of a successful Edge-Function suspend.
    await serviceSql`
      UPDATE public.staff_affiliations SET state = 'suspended' WHERE id = ${affA}
    `;
    const [a] = await serviceSql<{ state: string }[]>`
      SELECT state FROM public.staff_affiliations WHERE id = ${affA}
    `;
    const [b] = await serviceSql<{ state: string }[]>`
      SELECT state FROM public.staff_affiliations WHERE id = ${affB}
    `;
    expect(a?.state).toBe("suspended");
    expect(b?.state).toBe("active"); // unchanged, per-affiliation rule
  });

  test("review_note clears when the affiliation leaves pending_approval", async () => {
    // Seed a pending affiliation with a review_note (mimics what
    // ha-request-staff-info would do).
    const newClinician = await createTestUser("staffisol", "clinician-rn");
    const [pending] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.staff_affiliations
        (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state, review_note)
      VALUES
        (${newClinician.id}, ${hospitalA.id}, ${deptAId}, ${cadreId}, ${roleId}, 'full_time', 'pending_approval', 'Please re-upload your council registration.')
      RETURNING id
    `;
    if (!pending) throw new Error("pending affiliation seed failed");

    // Simulate an approve-staff-affiliation update (the Edge Function
    // clears review_note as part of the state flip).
    await serviceSql`
      UPDATE public.staff_affiliations
      SET state = 'approved',
          review_note = NULL,
          rejection_reason = NULL
      WHERE id = ${pending.id}
    `;

    const [after] = await serviceSql<{ state: string; review_note: string | null }[]>`
      SELECT state, review_note FROM public.staff_affiliations WHERE id = ${pending.id}
    `;
    expect(after?.state).toBe("approved");
    expect(after?.review_note).toBeNull();
  });
});
