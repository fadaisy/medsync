import type { TestUser } from "./_helpers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  anonClient,
  createTestHospital,
  createTestUser,
  deleteHospital,
  deleteUser,
  grantRole,
  serviceSql,
} from "./_helpers";

describe("RLS: public.hospital_departments", () => {
  let regular: TestUser;
  let admin: TestUser;
  let superAdmin: TestUser;
  let hospital: { id: string; slug: string };
  let department: { id: string };

  beforeAll(async () => {
    regular = await createTestUser("hd", "user");
    admin = await createTestUser("hd", "admin");
    superAdmin = await createTestUser("hd", "super");
    hospital = await createTestHospital("hd");
    await grantRole(admin.id, "hospital_admin", hospital.id);
    await grantRole(superAdmin.id, "superadmin", null);
    const [row] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospital.id}, 'Internal Medicine', 'internal-medicine')
      RETURNING id
    `;
    if (!row) throw new Error("department seed failed");
    department = { id: row.id };
  }, 60_000);

  afterAll(async () => {
    await deleteHospital(hospital.id).catch(() => {});
    for (const u of [regular, admin, superAdmin]) {
      await deleteUser(u.id).catch(() => {});
    }
  }, 30_000);

  test("anon CAN SELECT departments (open for signup)", async () => {
    const { data, error } = await anonClient().from("hospital_departments").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  test("authenticated CAN SELECT departments", async () => {
    const { data, error } = await regular.client.from("hospital_departments").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  test("non-admin CANNOT INSERT a department", async () => {
    const { error } = await regular.client.from("hospital_departments").insert({
      hospital_id: hospital.id,
      name: "Cardiology",
      slug: "cardiology",
      parent_id: department.id,
    });
    expect(error).not.toBeNull();
  });

  test("hospital_admin CAN INSERT a department in their hospital", async () => {
    const { data, error } = await admin.client
      .from("hospital_departments")
      .insert({
        hospital_id: hospital.id,
        name: "Cardiology",
        slug: "cardiology",
        parent_id: department.id,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe("Cardiology");
    await serviceSql`DELETE FROM public.hospital_departments WHERE id = ${data!.id}`;
  });

  test("superadmin CAN UPDATE a department", async () => {
    const { error } = await superAdmin.client
      .from("hospital_departments")
      .update({ name: "Internal Medicine (updated)" })
      .eq("id", department.id);
    expect(error).toBeNull();
    const [row] = await serviceSql<{ name: string }[]>`
      SELECT name FROM public.hospital_departments WHERE id = ${department.id}
    `;
    expect(row?.name).toBe("Internal Medicine (updated)");
  });
});
