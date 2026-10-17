import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { MFA_REQUIRED_ROLES } from "@/lib/auth";
import { env } from "@/lib/env";
import { dataProcessingConsent } from "@/lib/patient/scope";

/**
 * The phone's patient, from its bearer token (ADR 0342 §2). The web gates a patient with
 * `requirePatientScope`, which reads cookies and redirects; the phone sends
 * `Authorization: Bearer <access token>` and needs a status code instead. This runs the same checks in the
 * same order and answers with JSON:
 *
 *   1. the token is validated by Supabase (`getUser`, never a local decode) → 401;
 *   2. MFA: a patient who also holds a clinical/admin role must be at AAL2, as `resolvePatientScope` → 403;
 *   3. `users.state` is `verified` or `active` (copied from `resolvePatientScope`) → 403;
 *   4. the data-processing consent is accepted against the active text (Gate H) → 403 `consent`.
 *
 * There is no patient-role check because the web has none: patient sign-up writes no `user_roles` row.
 * `client` talks as the patient (RLS applies), for the one write the phone may make.
 */
export type Caller =
  | { ok: true; userId: string; client: SupabaseClient }
  | { ok: false; response: NextResponse };

/** Copied from `resolvePatientScope` (lib/patient/scope.ts), where it is a local constant. */
const REACHABLE_PATIENT_STATES = new Set(["verified", "active"]);

const refuse = (status: number, error: string, code?: string): Caller => ({
  ok: false,
  response: NextResponse.json(code ? { error, code } : { error }, { status }),
});

/** The `aal` claim of a token Supabase has already validated. */
function aalOf(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

export async function patientFromBearer(request: Request): Promise<Caller> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return refuse(401, "Sign in again.");

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return refuse(401, "Sign in again.");
  const userId = data.user.id;

  const { data: roleRows } = await client.from("user_roles").select("role").eq("user_id", userId);
  const mfaRequired = (roleRows ?? []).some((r: { role: string }) => MFA_REQUIRED_ROLES.has(r.role));
  if (mfaRequired && process.env.DEV_SKIP_MFA !== "1" && aalOf(token) !== "aal2")
    return refuse(403, "This account needs its second sign-in step. Sign in on the web.", "mfa");

  const [me] = await db
    .select({ state: users.state })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!me || !REACHABLE_PATIENT_STATES.has(me.state))
    return refuse(403, "This account can't see visit records yet.");

  const consent = await dataProcessingConsent(userId);
  if (consent && consent.acceptedAt === null)
    return refuse(403, "Please accept the updated privacy notice first.", "consent");

  return { ok: true, userId, client };
}
