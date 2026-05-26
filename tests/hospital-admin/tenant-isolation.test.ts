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
 * Tenant-isolation regression test for the hospital-admin workspace shell.
 *
 * Proves the security boundary the shell promises: a hospital_admin
 * cannot widen scope to another hospital, no matter what the JS does.
 * The proof lives at the database layer (RLS) so even a future shell
 * bug that accidentally passed a different hospital_id into a query
 * still gets refused by the wire.
 *
 * Scenario:
 *   - Hospital A + Hospital B (independent tenants)
 *   - admin-A: hospital_admin scoped to A
 *   - staff-B: pending staff_affiliation in B
 *   - With admin-A's anon-keyed client (RLS applied), SELECT
 *     staff_affiliations should return ONLY A's rows. Asking for B's
 *     row by id should resolve to empty.
 *
 * This is a regression guard for the shell — features built later
 * inherit the same RLS, so this test stays meaningful as the workspace
 * grows. Skipped unless MEDSYNC_ALLOW_RLS_DB_WRITES=1 (the same opt-in
 * pattern every other live-DB test uses).
 */

describe.skipIf(!RLS_TESTS_ENABLED)("hospital-admin: tenant isolation", () => {
  let hospitalA: { id: string };
  let hospitalB: { id: string };
  let adminA: TestUser;
  let staffBAffiliationId: string;
  let staffAAffiliationId: string;
  let departmentAId: string;
  let departmentBId: string;
  let cadreId: string;
  let roleId: string;

  beforeAll(async () => {
    // Two independent tenants.
    hospitalA = await createTestHospital("isol-a");
    hospitalB = await createTestHospital("isol-b");

    // Bare-minimum department + ref data for the affiliation FKs.
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
    departmentAId = deptA.id;
    departmentBId = deptB.id;

    // Reuse the first cadre + role in the seed catalog (existence
    // already verified by the broader test suite).
    const [cadre] = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.cadres LIMIT 1
    `;
    const [role] = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.roles LIMIT 1
    `;
    if (!cadre || !role) throw new Error("cadre/role seed missing");
    cadreId = cadre.id;
    roleId = role.id;

    // admin-A is hospital_admin for A only.
    adminA = await createTestUser("isol", "admin-a");
    await grantRole(adminA.id, "hospital_admin", hospitalA.id);

    // Staff affiliation in B (the row admin-A must NOT see).
    const staffB = await createTestUser("isol", "staff-b");
    const [staffBRow] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.staff_affiliations
        (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state)
      VALUES
        (${staffB.id}, ${hospitalB.id}, ${departmentBId}, ${cadreId}, ${roleId}, 'full_time', 'pending_approval')
      RETURNING id
    `;
    if (!staffBRow) throw new Error("staff B affiliation seed failed");
    staffBAffiliationId = staffBRow.id;

    // Staff affiliation in A (positive control — admin-A SHOULD see this).
    const staffA = await createTestUser("isol", "staff-a");
    const [staffARow] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.staff_affiliations
        (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state)
      VALUES
        (${staffA.id}, ${hospitalA.id}, ${departmentAId}, ${cadreId}, ${roleId}, 'full_time', 'pending_approval')
      RETURNING id
    `;
    if (!staffARow) throw new Error("staff A affiliation seed failed");
    staffAAffiliationId = staffARow.id;
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeSql();
  }, 60_000);

  test("admin-A can SELECT only their own hospital's staff_affiliations", async () => {
    const { data, error } = await adminA.client
      .from("staff_affiliations")
      .select("id, hospital_id");

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // The list MUST include A's row and MUST NOT include B's.
    const ids = (data ?? []).map((r) => r.id);
    const hospitalIds = new Set((data ?? []).map((r) => r.hospital_id));

    expect(ids).toContain(staffAAffiliationId);
    expect(ids).not.toContain(staffBAffiliationId);
    expect(hospitalIds.has(hospitalA.id)).toBe(true);
    expect(hospitalIds.has(hospitalB.id)).toBe(false);
  });

  test("admin-A querying B's affiliation by id resolves empty (RLS-refused)", async () => {
    const { data, error } = await adminA.client
      .from("staff_affiliations")
      .select("id")
      .eq("id", staffBAffiliationId);

    // RLS doesn't return an error — it returns an empty result set,
    // which is the "row doesn't exist for you" semantic.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test("admin-A querying B's hospital row resolves empty (defence in depth)", async () => {
    // hospitals.state changes are admin-visible only for hospitals
    // where the caller holds a role — the admin must not be able to
    // probe other hospitals' lifecycle state.
    const { data, error } = await adminA.client
      .from("hospitals")
      .select("id, state")
      .eq("id", hospitalB.id);

    expect(error).toBeNull();
    expect((data ?? []).find((r) => r.id === hospitalB.id)).toBeUndefined();
  });

  test("admin-A cannot UPDATE a staff_affiliation in B", async () => {
    const { data, error } = await adminA.client
      .from("staff_affiliations")
      .update({ state: "rejected" })
      .eq("id", staffBAffiliationId)
      .select("id");

    // The write either fails (preferred) or silently affects 0 rows
    // (also acceptable — same outcome from the attacker's POV).
    // What we MUST NOT see is the row coming back as updated.
    if (!error) {
      expect(data ?? []).toEqual([]);
    }

    // Verify via service client that the row's state is unchanged.
    const [check] = await serviceSql<{ state: string }[]>`
      SELECT state FROM public.staff_affiliations WHERE id = ${staffBAffiliationId}
    `;
    expect(check?.state).toBe("pending_approval");
  });
});
