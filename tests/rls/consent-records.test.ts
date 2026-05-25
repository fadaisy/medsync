import type { TestUser } from "./_helpers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { anonClient, createTestUser, deleteUser, RLS_TESTS_ENABLED, serviceSql } from "./_helpers";

describe.skipIf(!RLS_TESTS_ENABLED)("RLS: public.consent_records", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createTestUser("consent", "alice");
    bob = await createTestUser("consent", "bob");
    await serviceSql`
      INSERT INTO public.consent_records (user_id, consent_type, version, consent_text_sha256)
      VALUES
        (${alice.id}, 'data_processing', '1.0.0', 'a'),
        (${bob.id}, 'data_processing', '1.0.0', 'b')
    `;
  }, 60_000);

  afterAll(async () => {
    await deleteUser(alice.id).catch(() => {});
    await deleteUser(bob.id).catch(() => {});
  }, 30_000);

  test("anon CANNOT SELECT consent records", async () => {
    const { data } = await anonClient().from("consent_records").select("id");
    expect(data?.length ?? 0).toBe(0);
  });

  test("alice SELECTs only her own consent", async () => {
    const { data, error } = await alice.client.from("consent_records").select("user_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(alice.id);
  });

  test("alice CAN INSERT her own consent", async () => {
    const { error } = await alice.client.from("consent_records").insert({
      user_id: alice.id,
      consent_type: "sms_communication",
      version: "1.0.0",
      consent_text_sha256: "deadbeef",
    });
    expect(error).toBeNull();
  });

  test("alice CANNOT INSERT consent for bob", async () => {
    const { error } = await alice.client.from("consent_records").insert({
      user_id: bob.id,
      consent_type: "research_use",
      version: "1.0.0",
      consent_text_sha256: "evil",
    });
    expect(error).not.toBeNull();
  });

  test("authenticated CANNOT UPDATE consent (immutability)", async () => {
    const { error } = await alice.client
      .from("consent_records")
      .update({ consent_text_sha256: "tampered" })
      .eq("user_id", alice.id);
    expect(error).toBeNull();
    const rows = await serviceSql<{ consent_text_sha256: string }[]>`
      SELECT consent_text_sha256 FROM public.consent_records WHERE user_id = ${alice.id}
    `;
    expect(rows.every((r) => r.consent_text_sha256 !== "tampered")).toBe(true);
  });

  test("authenticated CANNOT DELETE consent", async () => {
    const { error } = await alice.client.from("consent_records").delete().eq("user_id", alice.id);
    expect(error).toBeNull();
    const rows = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.consent_records WHERE user_id = ${alice.id}
    `;
    expect(rows.length).toBeGreaterThan(0);
  });
});
