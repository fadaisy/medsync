import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// vitest.config.ts loads .env / .env.local at config time and passes the
// values through test.env, so process.env is populated when this module is
// evaluated. No loader needed here.

/**
 * Test helpers for live-Supabase RLS testing.
 *
 * Strategy:
 * 1. `createTestUser` provisions an auth.users row via the service-role admin
 *    API, then returns an anon-keyed client signed in as that user. RLS
 *    applies to every query on that client.
 * 2. `serviceSupabase()` is a service-role client for setup/cleanup that
 *    bypasses RLS.
 * 3. `serviceSql` is a raw postgres-js handle for direct INSERTs into seed
 *    data (hospitals, departments) without going through Supabase's REST API.
 * 4. `deleteUser` removes the test user (cascades to public.users, user_roles,
 *    consent_records).
 *
 * Naming convention: every test user email is `rls-<test>-<role>-<rand>@medsync.local`.
 * If a test crashes mid-run, the email pattern makes manual cleanup trivial.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  throw new Error("Test env not loaded — tests/_setup.ts should have loaded .env.local");
}

const TEST_PASSWORD = "test-password-rls-only-1234567";

export function serviceSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const _sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
export const serviceSql = _sql;

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

export function makeEmail(suite: string, role: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `rls-${suite}-${role}-${rand}@medsync.local`;
}

export async function createTestUser(suite: string, role: string): Promise<TestUser> {
  const admin = serviceSupabase();
  const email = makeEmail(suite, role);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createTestUser(${email}): ${createErr?.message ?? "no user"}`);
  }

  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr) {
    throw new Error(`signIn(${email}): ${signInErr.message}`);
  }

  return { id: created.user.id, email, client };
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
}

export async function deleteUser(userId: string): Promise<void> {
  const admin = serviceSupabase();
  await admin.auth.admin.deleteUser(userId);
}

export async function grantRole(
  userId: string,
  role: string,
  hospitalId: string | null,
): Promise<void> {
  await serviceSql`
    INSERT INTO public.user_roles (user_id, role, hospital_id)
    VALUES (${userId}, ${role}, ${hospitalId})
  `;
}

export async function createTestHospital(slug: string): Promise<{ id: string; slug: string }> {
  const fullSlug = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await serviceSql<{ id: string }[]>`
    INSERT INTO public.hospitals (name, slug, level)
    VALUES (${`Test ${slug}`}, ${fullSlug}, 'national_referral')
    RETURNING id
  `;
  if (!row) throw new Error("createTestHospital returned no row");
  return { id: row.id, slug: fullSlug };
}

export async function deleteHospital(id: string): Promise<void> {
  await serviceSql`DELETE FROM public.hospitals WHERE id = ${id}`;
}

/** Tear down any leftover test rows after the suite. */
export async function cleanup(): Promise<void> {
  await serviceSql`DELETE FROM public.hospitals WHERE slug LIKE 'test-%-%'`;
  const admin = serviceSupabase();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith("rls-") && u.email.endsWith("@medsync.local")) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

export async function closeSql(): Promise<void> {
  await _sql.end({ timeout: 5 });
}
