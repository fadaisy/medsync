import { afterAll, describe, expect, test } from "vitest";

import { closeSql, serviceSql, serviceSupabase } from "../rls/_helpers";

/**
 * Tests for the Phase 0.9 auth foundation:
 *   - auth.users INSERT trigger mirrors into public.users
 *   - public.users row carries the metadata.full_name when provided
 *   - falls back to email when full_name is empty
 *   - duplicate-email signups fail at the auth layer
 */

const CREATED_USER_IDS: string[] = [];

afterAll(async () => {
  const admin = serviceSupabase();
  for (const id of CREATED_USER_IDS) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
  await closeSql();
}, 60_000);

describe("auth: auth.users → public.users mirror trigger", () => {
  test("creates a public.users row with full_name from metadata", async () => {
    const email = `mirror-meta-${Math.random().toString(36).slice(2, 8)}@medsync.local`;
    const admin = serviceSupabase();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "test-password-mirror-1234",
      email_confirm: true,
      user_metadata: { full_name: "Mukasa Joseph" },
    });
    if (error || !data.user) throw error ?? new Error("create failed");
    CREATED_USER_IDS.push(data.user.id);

    const [row] = await serviceSql<{ email: string; full_name: string }[]>`
      SELECT email, full_name FROM public.users WHERE id = ${data.user.id}
    `;
    expect(row?.email).toBe(email);
    expect(row?.full_name).toBe("Mukasa Joseph");
  }, 30_000);

  test("falls back to email when full_name metadata is missing", async () => {
    const email = `mirror-noname-${Math.random().toString(36).slice(2, 8)}@medsync.local`;
    const admin = serviceSupabase();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "test-password-mirror-1234",
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("create failed");
    CREATED_USER_IDS.push(data.user.id);

    const [row] = await serviceSql<{ full_name: string }[]>`
      SELECT full_name FROM public.users WHERE id = ${data.user.id}
    `;
    expect(row?.full_name).toBe(email);
  }, 30_000);

  test("duplicate email signup fails at the auth layer (mirror not invoked twice)", async () => {
    const email = `mirror-dup-${Math.random().toString(36).slice(2, 8)}@medsync.local`;
    const admin = serviceSupabase();
    const first = await admin.auth.admin.createUser({
      email,
      password: "test-password-mirror-1234",
      email_confirm: true,
    });
    if (first.error || !first.data.user) throw first.error ?? new Error("first create failed");
    CREATED_USER_IDS.push(first.data.user.id);

    const second = await admin.auth.admin.createUser({
      email,
      password: "test-password-mirror-1234",
      email_confirm: true,
    });
    expect(second.error).not.toBeNull();

    const rows = await serviceSql<{ id: string }[]>`
      SELECT id FROM public.users WHERE email = ${email}
    `;
    expect(rows).toHaveLength(1);
  }, 30_000);
});

describe("auth: getAuthenticatorAssuranceLevel before MFA enrolment", () => {
  test("a fresh user has currentLevel=aal1, nextLevel=aal1 (MFA not enrolled)", async () => {
    const email = `mfa-pre-${Math.random().toString(36).slice(2, 8)}@medsync.local`;
    const admin = serviceSupabase();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "test-password-mfa-1234",
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("create failed");
    CREATED_USER_IDS.push(data.user.id);

    // Sign in as them to get a usable client.
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error: signInErr } = await client.auth.signInWithPassword({
      email,
      password: "test-password-mfa-1234",
    });
    expect(signInErr).toBeNull();

    const { data: aal, error: aalErr } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aalErr).toBeNull();
    expect(aal?.currentLevel).toBe("aal1");
    expect(aal?.nextLevel).toBe("aal1");
  }, 30_000);
});
