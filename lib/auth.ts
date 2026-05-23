import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Roles whose holders are REQUIRED to enrol TOTP MFA and pass an AAL2
 * challenge on every fresh session. Patients are optional (per kickoff).
 */
export const MFA_REQUIRED_ROLES = new Set<string>([
  "clinician",
  "nurse",
  "pharmacist",
  "lab_tech",
  "hospital_admin",
  "superadmin",
]);

/** Full role row — needed for hospital-scoped roles. */
export interface RoleRow {
  role: string;
  hospitalId: string | null;
}

export interface AuthState {
  user: User | null;
  /** All role rows for the user (empty if none assigned yet). */
  roles: string[];
  /** Full role rows including the hospital_id scope (null for global roles). */
  roleRows: RoleRow[];
  /** True if the user holds any role in MFA_REQUIRED_ROLES. */
  mfaRequired: boolean;
  /** Current Authenticator Assurance Level from Supabase. */
  aal: "aal1" | "aal2" | null;
  /** nextLevel from Supabase — "aal2" means the user has MFA enrolled. */
  nextAal: "aal1" | "aal2" | null;
}

/**
 * Single source of truth for "who is the user and what do they need to do
 * next". Used by proxy.ts and any Server Component that needs auth state.
 *
 * Always calls `getUser()` (server-validates the JWT). NEVER call
 * `getSession()` — its cookie value is forgeable.
 */
export async function getAuthState(): Promise<AuthState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      user: null,
      roles: [],
      roleRows: [],
      mfaRequired: false,
      aal: null,
      nextAal: null,
    };
  }

  const [rolesResult, aalResult] = await Promise.all([
    supabase.from("user_roles").select("role, hospital_id").eq("user_id", user.id),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const rawRows = (rolesResult.data ?? []) as Array<{ role: string; hospital_id: string | null }>;
  const roleRows: RoleRow[] = rawRows.map((r) => ({ role: r.role, hospitalId: r.hospital_id }));
  const roles = roleRows.map((r) => r.role);
  const mfaRequired = roles.some((r) => MFA_REQUIRED_ROLES.has(r));

  return {
    user,
    roles,
    roleRows,
    mfaRequired,
    aal: (aalResult.data?.currentLevel as "aal1" | "aal2" | null) ?? null,
    nextAal: (aalResult.data?.nextLevel as "aal1" | "aal2" | null) ?? null,
  };
}

// ─── Role guards (server-component / server-action helpers) ─────────────

/**
 * Require a signed-in superadmin or redirect. Returns the auth state
 * for further use. Call from server components / server actions where
 * unauthorized access should bounce the user to /sign-in.
 */
export async function requireSuperadmin(): Promise<AuthState> {
  const state = await getAuthState();
  if (!state.user) redirect("/sign-in?redirect=/admin");
  if (!state.roles.includes("superadmin")) redirect("/dashboard?denied=superadmin");
  return state;
}

/**
 * Require a signed-in superadmin OR hospital_admin (at any hospital).
 * Used by the affiliation queue which both roles can see (superadmin
 * sees all, hospital_admin sees their hospital's pending only — that
 * filter is applied at the query layer).
 */
export async function requireAdminish(): Promise<AuthState> {
  const state = await getAuthState();
  if (!state.user) redirect("/sign-in?redirect=/admin");
  const hasAdmin = state.roles.some((r) => r === "superadmin" || r === "hospital_admin");
  if (!hasAdmin) redirect("/dashboard?denied=admin");
  return state;
}

/** Hospital IDs the user holds hospital_admin scope at. */
export function adminHospitalIds(state: AuthState): string[] {
  return state.roleRows
    .filter((r) => r.role === "hospital_admin" && r.hospitalId)
    .map((r) => r.hospitalId as string);
}
