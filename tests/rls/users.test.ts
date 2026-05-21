import type { TestUser } from "./_helpers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { anonClient, cleanup, closeSql, createTestUser, deleteUser, serviceSql } from "./_helpers";

describe("RLS: public.users", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createTestUser("users", "alice");
    bob = await createTestUser("users", "bob");
    await serviceSql`
      INSERT INTO public.users (id, email, full_name)
      VALUES (${alice.id}, ${alice.email}, 'Alice'), (${bob.id}, ${bob.email}, 'Bob')
    `;
  }, 60_000);

  afterAll(async () => {
    await deleteUser(alice.id).catch(() => {});
    await deleteUser(bob.id).catch(() => {});
  }, 30_000);

  test("anon cannot SELECT users", async () => {
    const { data, error } = await anonClient().from("users").select("*");
    // RLS denies — Supabase returns empty rows + no error for anon-blocked
    // tables. Either an error or zero rows is acceptable; never both rows.
    expect(error ?? data?.length).not.toBe(2);
    expect(data?.length ?? 0).toBe(0);
  });

  test("alice SELECTs only her own row", async () => {
    const { data, error } = await alice.client.from("users").select("id,email");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(alice.id);
  });

  test("alice can UPDATE her own row", async () => {
    const { error } = await alice.client
      .from("users")
      .update({ full_name: "Alice Updated" })
      .eq("id", alice.id);
    expect(error).toBeNull();

    const [row] = await serviceSql<{ full_name: string }[]>`
      SELECT full_name FROM public.users WHERE id = ${alice.id}
    `;
    expect(row?.full_name).toBe("Alice Updated");
  });

  test("alice CANNOT UPDATE bob's row", async () => {
    const { error } = await alice.client
      .from("users")
      .update({ full_name: "hacked" })
      .eq("id", bob.id);
    // RLS denial returns no error but updates zero rows. Verify bob unchanged.
    expect(error).toBeNull();
    const [row] = await serviceSql<{ full_name: string }[]>`
      SELECT full_name FROM public.users WHERE id = ${bob.id}
    `;
    expect(row?.full_name).toBe("Bob");
  });

  test("authenticated CANNOT INSERT into users", async () => {
    const { error } = await alice.client
      .from("users")
      .insert({ id: crypto.randomUUID(), email: "x@x.com", full_name: "x" });
    expect(error).not.toBeNull();
  });

  test("authenticated CANNOT DELETE users", async () => {
    const { error } = await alice.client.from("users").delete().eq("id", alice.id);
    // Supabase returns no error on RLS-blocked DELETE; verify row still there.
    expect(error).toBeNull();
    const [row] = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.users WHERE id = ${alice.id}
    `;
    expect(row?.id).toBe(alice.id);
  });
});

afterAll(async () => {
  await cleanup();
  await closeSql();
}, 60_000);
