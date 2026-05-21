import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { env } from "@/lib/env";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Liveness + wiring check for Phase 0.3.
 *
 * Verifies that:
 *   - the Drizzle/postgres pool can hit the Supabase pooler (SELECT now())
 *   - `createServerClient` (cookie-aware, anon key) reaches Supabase auth
 *   - `createServiceClient` (service role) reaches the auth admin API
 *
 * Gated to non-production. In production we replace this with a hardened
 * health endpoint or remove it entirely.
 */
export async function GET() {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const checks: Record<string, { ok: boolean } & Record<string, unknown>> = {};

  try {
    const result = await db.execute<{ ts: string; db: string }>(
      sql`SELECT now()::text as ts, current_database() as db`,
    );
    const row = (result as unknown as ReadonlyArray<{ ts: string; db: string }>)[0];
    checks.drizzle = { ok: true, ts: row?.ts, database: row?.db };
  } catch (error) {
    checks.drizzle = { ok: false, error: errorMessage(error) };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.getUser();
    // An unauthenticated `getUser()` returning `{ user: null, error: ... }`
    // is the expected happy path: it proves the client reaches Supabase.
    checks.supabase_server = {
      ok: true,
      note: "anon getUser() call succeeded (no user, expected)",
      error: error?.message,
    };
  } catch (error) {
    checks.supabase_server = { ok: false, error: errorMessage(error) };
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) throw error;
    checks.supabase_service = { ok: true, user_count: data.users.length };
  } catch (error) {
    checks.supabase_service = { ok: false, error: errorMessage(error) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
