import "server-only";

import type { CadreGroup, Landing, LandingFacts } from "@/lib/auth/landing";

import { resolveLanding } from "@/lib/auth/landing";
import { DOCTOR_CADRE_CODES } from "@/lib/doctor/scope";
import { LAB_TECH_CADRE_CODES } from "@/lib/lab-tech/scope";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Where a signed-in user lands. Shared by the password step and the authenticator-code step, so
 * the second can never drop a user somewhere the first would not. This file gathers the facts;
 * the decision is the pure `resolveLanding` (lib/auth/landing.ts, ADR 0223), which also decides
 * whether the page's ?redirect= may be honoured.
 *
 * Uses the service client to bypass RLS — the user-context session cookie isn't reliably applied
 * to the same request's downstream queries, so a user-context query would intermittently return
 * empty and silently default away. Matches the pattern /admin/layout.tsx uses for role lookup.
 */
export async function landingFor(userId: string, next?: string | null): Promise<Landing> {
  const facts = await landingFacts(userId);
  const landing = resolveLanding(facts, next);
  if (landing.refusedNext) {
    // The workspace prefix only: no ids, no query string (LD-4).
    logger.warn("sign-in.redirect_refused", { prefix: landing.refusedNext });
  }
  return landing;
}

const NURSE_CADRES = ["NURSE", "MIDWIFE", "SPECIALIST_NURSE"];

export function cadreGroup(code: string | null | undefined): CadreGroup {
  if (code == null) return "other";
  if ((DOCTOR_CADRE_CODES as readonly string[]).includes(code)) return "doctor";
  if (NURSE_CADRES.includes(code)) return "nurse";
  if (code === "RECEPTION") return "reception";
  if ((LAB_TECH_CADRE_CODES as readonly string[]).includes(code)) return "lab";
  return "other";
}

const cadreOf = (row: unknown) => (row as { cadres?: { code?: string } }).cadres?.code;

async function landingFacts(userId: string): Promise<LandingFacts> {
  const service = createServiceClient();
  const warnOn = (what: string, error: { message: string } | null) => {
    if (error) logger.warn(`sign-in.routing.${what}_query_failed`, { reason: error.message });
  };

  const [roles, active, latest, application, patient] = await Promise.all([
    service.from("user_roles").select("role").eq("user_id", userId),
    service
      .from("staff_affiliations")
      .select("cadres!inner(code)")
      .eq("user_id", userId)
      .in("state", ["active", "approved"]),
    service
      .from("staff_affiliations")
      .select("state, cadres!inner(code)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("hospital_applications")
      .select("state")
      .eq("applicant_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service.from("patient_profiles").select("id").eq("id", userId).maybeSingle(),
  ]);
  warnOn("user_roles", roles.error);
  warnOn("active_affiliations", active.error);
  warnOn("staff_affiliations", latest.error);
  warnOn("hospital_applications", application.error);
  warnOn("patient_profiles", patient.error);

  const activeGroups = (active.data ?? []).map((row) => cadreGroup(cadreOf(row)));
  return {
    roles: (roles.data ?? []).map((r) => r.role as string),
    active: { doctor: activeGroups.includes("doctor"), lab: activeGroups.includes("lab") },
    latestAffiliation: latest.data
      ? { state: latest.data.state as string, group: cadreGroup(cadreOf(latest.data)) }
      : null,
    hospitalApplicationState: (application.data?.state as string | undefined) ?? null,
    hasPatientProfile: !!patient.data,
  };
}
