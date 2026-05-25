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
  serviceSupabase,
} from "./_helpers";

/**
 * RLS coverage for the hospital-registration-upgrade tables (GATE A
 * schema, GATE C wiring). Validates the kickoff's tenant-isolation
 * + agreement-gate guarantees end-to-end.
 *
 * Scoped to the highest-value surfaces:
 *   - hospital_dpa_versions       — public SELECT, superadmin-only INSERT
 *   - hospital_agreements         — scoped SELECT, service-role-only INSERT
 *   - hospital_wards              — scoped SELECT + admin-only writes
 *   - hospital_admin_roster       — scoped SELECT, service-role-only writes
 *   - hospital_staff_invitations  — scoped SELECT, service-role-only writes
 */

describe.skipIf(!RLS_TESTS_ENABLED)("RLS: hospital_dpa_versions", () => {
  let nonAdmin: TestUser;
  let superAdmin: TestUser;

  beforeAll(async () => {
    nonAdmin = await createTestUser("dpa", "user");
    superAdmin = await createTestUser("dpa", "super");
    await grantRole(superAdmin.id, "superadmin", null);
  }, 60_000);

  afterAll(async () => {
    await deleteUser(nonAdmin.id).catch(() => {});
    await deleteUser(superAdmin.id).catch(() => {});
  }, 30_000);

  test("anon CAN SELECT (DPA must be readable before sign-in)", async () => {
    const { data, error } = await anonClient().from("hospital_dpa_versions").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  test("authenticated non-superadmin CAN SELECT", async () => {
    const { data, error } = await nonAdmin.client.from("hospital_dpa_versions").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  test("non-superadmin CANNOT INSERT", async () => {
    const { error } = await nonAdmin.client.from("hospital_dpa_versions").insert({
      version: `pirate-${Date.now()}`,
      effective_date: new Date().toISOString().slice(0, 10),
      body: "fake body",
      body_sha256: "0".repeat(64),
    });
    expect(error).not.toBeNull();
  });
});

describe.skipIf(!RLS_TESTS_ENABLED)("RLS: hospital_agreements", () => {
  let alphaAdmin: TestUser;
  let betaAdmin: TestUser;
  let nobody: TestUser;
  let superAdmin: TestUser;
  let alphaHospital: { id: string };
  let betaHospital: { id: string };
  let alphaAgreementId: string;

  beforeAll(async () => {
    alphaAdmin = await createTestUser("agree", "alpha");
    betaAdmin = await createTestUser("agree", "beta");
    nobody = await createTestUser("agree", "nobody");
    superAdmin = await createTestUser("agree", "super");
    alphaHospital = await createTestHospital("agree-alpha");
    betaHospital = await createTestHospital("agree-beta");
    await grantRole(alphaAdmin.id, "hospital_admin", alphaHospital.id);
    await grantRole(betaAdmin.id, "hospital_admin", betaHospital.id);
    await grantRole(superAdmin.id, "superadmin", null);

    // Seed an agreement row on alpha via service-role (the Edge Function
    // path); needs the placeholder DPA version to FK to.
    const sb = serviceSupabase();
    const { data: dpa } = await sb
      .from("hospital_dpa_versions")
      .select("id")
      .order("effective_date", { ascending: false })
      .limit(1)
      .single();
    if (!dpa) throw new Error("DPA placeholder not seeded — run supabase db push");
    const { data: ag, error } = await sb
      .from("hospital_agreements")
      .insert({
        hospital_id: alphaHospital.id,
        dpa_version_id: dpa.id,
        signed_by_user_id: alphaAdmin.id,
        signatory_name: "Test Signatory",
        signatory_title: "administrator",
        source: "applicant_flow",
      })
      .select("id")
      .single();
    if (error || !ag) throw new Error(`agreement seed failed: ${error?.message}`);
    alphaAgreementId = ag.id;
  }, 90_000);

  afterAll(async () => {
    await serviceSql`DELETE FROM public.hospital_agreements WHERE id = ${alphaAgreementId}`;
    await deleteHospital(alphaHospital.id).catch(() => {});
    await deleteHospital(betaHospital.id).catch(() => {});
    await deleteUser(alphaAdmin.id).catch(() => {});
    await deleteUser(betaAdmin.id).catch(() => {});
    await deleteUser(nobody.id).catch(() => {});
    await deleteUser(superAdmin.id).catch(() => {});
  }, 30_000);

  test("hospital_admin CAN SELECT own hospital's agreement", async () => {
    const { data, error } = await alphaAdmin.client
      .from("hospital_agreements")
      .select("id")
      .eq("hospital_id", alphaHospital.id);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  test("hospital_admin CANNOT SELECT another hospital's agreement (tenant isolation)", async () => {
    const { data, error } = await betaAdmin.client
      .from("hospital_agreements")
      .select("id")
      .eq("hospital_id", alphaHospital.id);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  test("user with no role CANNOT SELECT any agreement", async () => {
    const { data, error } = await nobody.client.from("hospital_agreements").select("id");
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  test("superadmin CAN SELECT every agreement", async () => {
    const { data, error } = await superAdmin.client
      .from("hospital_agreements")
      .select("id")
      .eq("id", alphaAgreementId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  test("authenticated user CANNOT INSERT an agreement directly", async () => {
    const sb = serviceSupabase();
    const { data: dpa } = await sb.from("hospital_dpa_versions").select("id").limit(1).single();
    const { error } = await alphaAdmin.client.from("hospital_agreements").insert({
      hospital_id: alphaHospital.id,
      dpa_version_id: dpa!.id,
      signed_by_user_id: alphaAdmin.id,
      signatory_name: "Spoof",
      signatory_title: "administrator",
      source: "applicant_flow",
    });
    expect(error).not.toBeNull();
  });
});

describe.skipIf(!RLS_TESTS_ENABLED)("RLS: hospital_wards", () => {
  let alphaAdmin: TestUser;
  let betaAdmin: TestUser;
  let superAdmin: TestUser;
  let alphaHospital: { id: string };
  let betaHospital: { id: string };

  beforeAll(async () => {
    alphaAdmin = await createTestUser("wards", "alpha");
    betaAdmin = await createTestUser("wards", "beta");
    superAdmin = await createTestUser("wards", "super");
    alphaHospital = await createTestHospital("wards-alpha");
    betaHospital = await createTestHospital("wards-beta");
    await grantRole(alphaAdmin.id, "hospital_admin", alphaHospital.id);
    await grantRole(betaAdmin.id, "hospital_admin", betaHospital.id);
    await grantRole(superAdmin.id, "superadmin", null);
  }, 60_000);

  afterAll(async () => {
    await serviceSql`DELETE FROM public.hospital_wards WHERE hospital_id IN (${alphaHospital.id}, ${betaHospital.id})`;
    await deleteHospital(alphaHospital.id).catch(() => {});
    await deleteHospital(betaHospital.id).catch(() => {});
    await deleteUser(alphaAdmin.id).catch(() => {});
    await deleteUser(betaAdmin.id).catch(() => {});
    await deleteUser(superAdmin.id).catch(() => {});
  }, 30_000);

  test("hospital_admin CAN INSERT a ward for own hospital", async () => {
    const { error } = await alphaAdmin.client.from("hospital_wards").insert({
      hospital_id: alphaHospital.id,
      name: "Med Ward 1",
      slug: "med-1",
      bed_count: 12,
    });
    expect(error).toBeNull();
  });

  test("hospital_admin CANNOT INSERT a ward for another hospital (tenant isolation)", async () => {
    const { error } = await betaAdmin.client.from("hospital_wards").insert({
      hospital_id: alphaHospital.id,
      name: "Pirate Ward",
      slug: "pirate",
      bed_count: 0,
    });
    expect(error).not.toBeNull();
  });

  test("hospital_admin CAN SELECT own wards but not others'", async () => {
    const { data: own } = await alphaAdmin.client
      .from("hospital_wards")
      .select("id")
      .eq("hospital_id", alphaHospital.id);
    expect(own?.length ?? 0).toBeGreaterThan(0);

    const { data: foreign } = await alphaAdmin.client
      .from("hospital_wards")
      .select("id")
      .eq("hospital_id", betaHospital.id);
    expect(foreign?.length ?? 0).toBe(0);
  });

  test("superadmin CAN SELECT every ward", async () => {
    const { data, error } = await superAdmin.client
      .from("hospital_wards")
      .select("id")
      .in("hospital_id", [alphaHospital.id, betaHospital.id]);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });
});

describe.skipIf(!RLS_TESTS_ENABLED)(
  "RLS: hospital_admin_roster + hospital_staff_invitations",
  () => {
    let alphaAdmin: TestUser;
    let nobody: TestUser;
    let superAdmin: TestUser;
    let alphaHospital: { id: string };

    beforeAll(async () => {
      alphaAdmin = await createTestUser("roster", "alpha");
      nobody = await createTestUser("roster", "nobody");
      superAdmin = await createTestUser("roster", "super");
      alphaHospital = await createTestHospital("roster-alpha");
      await grantRole(alphaAdmin.id, "hospital_admin", alphaHospital.id);
      await grantRole(superAdmin.id, "superadmin", null);

      // Seed a roster row + an invitation via service-role.
      const sb = serviceSupabase();
      await sb.from("hospital_admin_roster").insert({
        hospital_id: alphaHospital.id,
        user_id: alphaAdmin.id,
        designation: "primary",
        designated_by: superAdmin.id,
      });
      await sb.from("hospital_staff_invitations").insert({
        hospital_id: alphaHospital.id,
        invited_email: "invitee@test.local",
        invitation_token_hash: "fake-hash",
        invited_by: alphaAdmin.id,
      });
    }, 60_000);

    afterAll(async () => {
      await serviceSql`DELETE FROM public.hospital_admin_roster WHERE hospital_id = ${alphaHospital.id}`;
      await serviceSql`DELETE FROM public.hospital_staff_invitations WHERE hospital_id = ${alphaHospital.id}`;
      await deleteHospital(alphaHospital.id).catch(() => {});
      await deleteUser(alphaAdmin.id).catch(() => {});
      await deleteUser(nobody.id).catch(() => {});
      await deleteUser(superAdmin.id).catch(() => {});
    }, 30_000);

    test("hospital_admin CAN SELECT own roster", async () => {
      const { data, error } = await alphaAdmin.client
        .from("hospital_admin_roster")
        .select("id")
        .eq("hospital_id", alphaHospital.id);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    });

    test("user with no role CANNOT SELECT roster", async () => {
      const { data } = await nobody.client.from("hospital_admin_roster").select("id");
      expect(data?.length ?? 0).toBe(0);
    });

    test("hospital_admin CANNOT INSERT roster row directly (service-role only)", async () => {
      const { error } = await alphaAdmin.client.from("hospital_admin_roster").insert({
        hospital_id: alphaHospital.id,
        user_id: alphaAdmin.id,
        designation: "backup",
        designated_by: alphaAdmin.id,
      });
      expect(error).not.toBeNull();
    });

    test("hospital_admin CAN SELECT own invitations", async () => {
      const { data, error } = await alphaAdmin.client
        .from("hospital_staff_invitations")
        .select("id")
        .eq("hospital_id", alphaHospital.id);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    });

    test("hospital_admin CANNOT INSERT invitation directly (service-role only)", async () => {
      const { error } = await alphaAdmin.client.from("hospital_staff_invitations").insert({
        hospital_id: alphaHospital.id,
        invited_email: "spoof@test.local",
        invitation_token_hash: "fake",
        invited_by: alphaAdmin.id,
      });
      expect(error).not.toBeNull();
    });
  },
);
