import type { TestUser } from "./_helpers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  anonClient,
  cleanup,
  createTestUser,
  grantRole,
  RLS_TESTS_ENABLED,
  serviceSql,
} from "./_helpers";

/**
 * RLS: the ward builder's tables (migration 0090, ADRs 0191–0194). Hospital isolation for every new
 * table; assignments (they name a patient) hidden from non-clinical staff; no client writes at all, so
 * a nurse of another ward (or of this one) can't set a bed's state except through ha-services-hub,
 * which checks the ward (tests/wards/invariants, tests/wards/editor-board "who may act"). The same rules
 * run on every commit on the PGlite lane (tests/emr-db/ward-builder.test.ts).
 *
 * Live-DB suite: SKIPS unless MEDSYNC_ALLOW_RLS_DB_WRITES=1 against a TEST project with 0090 applied.
 */

describe.skipIf(!RLS_TESTS_ENABLED)("RLS: the ward builder's tables", () => {
  let admin: TestUser;
  let nurse: TestUser;
  let desk: TestUser;
  let outsider: TestUser;
  let patient: TestUser;
  let hospitalA: string;
  let hospitalB: string;
  let wardA: string;
  let bedA: string;

  async function affiliate(user: TestUser, hospitalId: string, clinical: boolean) {
    const [dept] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospitalId}, 'Ward builder RLS', ${`ward-rls-${user.id.slice(0, 8)}`}) RETURNING id`;
    const [cadre] = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.cadres WHERE is_clinical = ${clinical} LIMIT 1`;
    const [role] = await serviceSql<{ id: string }[]>`SELECT id FROM public.roles LIMIT 1`;
    await serviceSql`
      INSERT INTO public.staff_affiliations
        (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state, approved_at)
      VALUES (${user.id}, ${hospitalId}, ${dept!.id}, ${cadre!.id}, ${role!.id}, 'full_time', 'active', now())`;
    return dept!.id;
  }

  beforeAll(async () => {
    admin = await createTestUser("wards", "admin");
    nurse = await createTestUser("wards", "nurse");
    desk = await createTestUser("wards", "desk");
    outsider = await createTestUser("wards", "outsider");
    patient = await createTestUser("wards", "patient");
    const [a] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospitals (name, slug, level)
      VALUES ('RLS Ward Builder A', 'rls-ward-builder-a', 'national_referral')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    const [b] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospitals (name, slug, level)
      VALUES ('RLS Ward Builder B', 'rls-ward-builder-b', 'national_referral')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    hospitalA = a!.id;
    hospitalB = b!.id;
    await grantRole(admin.id, "hospital_admin", hospitalA);
    const dept = await affiliate(nurse, hospitalA, true);
    await affiliate(desk, hospitalA, false);
    await affiliate(outsider, hospitalB, true);
    const [w] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug, bed_count)
      VALUES (${hospitalA}, ${dept}, 'RLS ward', ${`rls-ward-${Date.now()}`}, 1) RETURNING id`;
    wardA = w!.id;
    const [bed] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_beds (hospital_id, ward_id, label) VALUES (${hospitalA}, ${wardA}, 'B1') RETURNING id`;
    bedA = bed!.id;
    await serviceSql`
      INSERT INTO public.ward_layouts (hospital_id, ward_id, version, floor_w_cells, floor_h_cells, document)
      VALUES (${hospitalA}, ${wardA}, 1, 42, 32, ${serviceSql.json({ v: 1, floor: { w: 42, h: 32 }, rooms: [], dividers: [], doors: [], fixtures: [], beds: [] })})`;
    await serviceSql`
      INSERT INTO public.hospital_bed_services (bed_id, hospital_id, service_code) VALUES (${bedA}, ${hospitalA}, 'o2')`;
    await serviceSql`
      INSERT INTO public.bed_state_events (hospital_id, bed_id, state, set_by) VALUES (${hospitalA}, ${bedA}, 'cleaning', ${nurse.id})`;
    await serviceSql`
      INSERT INTO public.bed_assignments (hospital_id, ward_id, bed_id, patient_user_id, started_by)
      VALUES (${hospitalA}, ${wardA}, ${bedA}, ${patient.id}, ${nurse.id})`;
  }, 120_000);

  afterAll(async () => {
    await serviceSql`DELETE FROM public.hospitals WHERE id IN (${hospitalA}, ${hospitalB})`.catch(
      () => {},
    );
    await cleanup();
  }, 60_000);

  const count = async (client: TestUser["client"], table: string) => {
    const { data, error } = await client.from(table).select("id").eq("hospital_id", hospitalA);
    expect(error).toBeNull();
    return data?.length ?? 0;
  };

  for (const table of ["ward_layouts", "hospital_bed_services", "bed_state_events"]) {
    test(`${table}: the hospital's admin and staff read; another hospital and anonymous don't`, async () => {
      expect(await count(admin.client, table)).toBe(1);
      expect(await count(nurse.client, table)).toBe(1);
      expect(await count(desk.client, table)).toBe(1);
      expect(await count(outsider.client, table)).toBe(0);
      const anon = await anonClient().from(table).select("id").eq("hospital_id", hospitalA);
      expect(anon.data?.length ?? 0).toBe(0);
    });
  }

  test("bed_assignments name a patient: clinical staff and the admin only", async () => {
    expect(await count(admin.client, "bed_assignments")).toBe(1);
    expect(await count(nurse.client, "bed_assignments")).toBe(1);
    expect(await count(desk.client, "bed_assignments")).toBe(0);
    expect(await count(outsider.client, "bed_assignments")).toBe(0);
  });

  test("no client writes: a nurse can't set a bed's state or take a bed directly", async () => {
    const state = await nurse.client
      .from("bed_state_events")
      .insert({ hospital_id: hospitalA, bed_id: bedA, state: "free", set_by: nurse.id });
    expect(state.error).not.toBeNull();
    const other = await outsider.client
      .from("bed_state_events")
      .insert({ hospital_id: hospitalA, bed_id: bedA, state: "free", set_by: outsider.id });
    expect(other.error).not.toBeNull();
    const assign = await admin.client
      .from("bed_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("bed_id", bedA)
      .select("id");
    expect(assign.data ?? []).toEqual([]);
    const layout = await admin.client
      .from("ward_layouts")
      .delete()
      .eq("ward_id", wardA)
      .select("id");
    expect(layout.data ?? []).toEqual([]);
  });

  test("the publish function is the service role's alone", async () => {
    const r = await admin.client.rpc("ward_layout_publish", { p: {} });
    expect(r.error).not.toBeNull();
  });
});
