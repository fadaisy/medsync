import type { TestUser } from "./_helpers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  anonClient,
  createTestHospital,
  createTestUser,
  deleteHospital,
  deleteUser,
  grantRole,
  RLS_TESTS_ENABLED,
  serviceSql,
} from "./_helpers";

describe.skipIf(!RLS_TESTS_ENABLED)("RLS: public.hospitals", () => {
  let nonAdmin: TestUser;
  let superAdmin: TestUser;
  let hospital: { id: string; slug: string };

  beforeAll(async () => {
    nonAdmin = await createTestUser("hospitals", "user");
    superAdmin = await createTestUser("hospitals", "super");
    hospital = await createTestHospital("test-hospital");
    await grantRole(superAdmin.id, "superadmin", null);
  }, 60_000);

  afterAll(async () => {
    await deleteHospital(hospital.id).catch(() => {});
    await deleteUser(nonAdmin.id).catch(() => {});
    await deleteUser(superAdmin.id).catch(() => {});
  }, 30_000);

  test("anon CAN SELECT hospitals (open for signup)", async () => {
    const { data, error } = await anonClient().from("hospitals").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  test("authenticated CAN SELECT hospitals", async () => {
    const { data, error } = await nonAdmin.client.from("hospitals").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  test("non-superadmin CANNOT INSERT a hospital", async () => {
    const { error } = await nonAdmin.client
      .from("hospitals")
      .insert({ name: "Pirate Hospital", slug: `pirate-${Date.now()}`, level: "private" });
    expect(error).not.toBeNull();
  });

  test("superadmin CAN INSERT a hospital", async () => {
    const slug = `super-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await superAdmin.client
      .from("hospitals")
      .insert({ name: "Super Test Hospital", slug, level: "private" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.slug).toBe(slug);
    await serviceSql`DELETE FROM public.hospitals WHERE slug = ${slug}`;
  });

  test("non-superadmin CANNOT UPDATE a hospital", async () => {
    const { error } = await nonAdmin.client
      .from("hospitals")
      .update({ name: "hacked" })
      .eq("id", hospital.id);
    expect(error).toBeNull();
    const [row] = await serviceSql<{ name: string }[]>`
      SELECT name FROM public.hospitals WHERE id = ${hospital.id}
    `;
    expect(row?.name).not.toBe("hacked");
  });

  test("superadmin CAN UPDATE a hospital", async () => {
    const { error } = await superAdmin.client
      .from("hospitals")
      .update({ region: "Central" })
      .eq("id", hospital.id);
    expect(error).toBeNull();
    const [row] = await serviceSql<{ region: string | null }[]>`
      SELECT region FROM public.hospitals WHERE id = ${hospital.id}
    `;
    expect(row?.region).toBe("Central");
  });
});
