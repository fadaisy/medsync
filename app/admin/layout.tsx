import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getAuthState } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminShell } from "./_components/admin-shell";
import { getApprovalsCount } from "./_lib/approvals-count";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin section gate (superadmin workspace + hospital-admin queue).
 *
 * Defence in depth on top of `proxy.ts`. The proxy enforces auth +
 * AAL2 + MFA enrollment for /admin (Phase 0). This layout re-checks
 * each invariant server-side because:
 *
 *   1. `proxy.ts` runs once per request; the layout runs per render.
 *   2. We want a hard fail-closed boundary right at the page entry,
 *      even if a future proxy refactor accidentally loosens its
 *      matcher.
 *   3. AAL2 is read here so a session that lost its MFA factor mid-
 *      flight bounces immediately instead of continuing to render
 *      admin surfaces.
 *
 * Checks, in order:
 *   1. getAuthState() — JWT-validated user + roles + AAL.
 *   2. Authenticated? Else /sign-in?next=/admin.
 *   3. MFA-required role + nextLevel != aal2 → /onboarding/mfa-setup.
 *   4. AAL != aal2 → /sign-in/mfa.
 *   5. Holds superadmin OR scoped hospital_admin? Else /dashboard.
 *
 * Once the checks pass, hands off to <AdminShell /> which renders the
 * persistent sidebar, top bar (with ⌘K palette + secure-session
 * indicator), and the slot for the active route.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const state = await getAuthState();

  if (!state.user) {
    redirect("/sign-in?next=/admin");
  }

  if (state.mfaRequired && state.nextAal !== "aal2") {
    redirect("/onboarding/mfa-setup");
  }
  if (state.aal !== "aal2") {
    redirect("/sign-in/mfa?next=/admin");
  }

  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role, hospital_id")
    .eq("user_id", state.user.id);

  const isSuperadmin = !!rolesData?.some((r) => r.role === "superadmin");
  const hospitalAdminHospitalIds = (rolesData ?? [])
    .filter((r) => r.role === "hospital_admin" && r.hospital_id)
    .map((r) => r.hospital_id as string);

  if (!isSuperadmin && hospitalAdminHospitalIds.length === 0) {
    // Authenticated but not an admin — bounce to dashboard rather
    // than leaking the existence of /admin via a 403 page.
    redirect("/dashboard");
  }

  // Live count for the sidebar pin. Failures degrade to 0 silently.
  const approvalsCount = await getApprovalsCount();

  return (
    <AdminShell
      isSuperadmin={isSuperadmin}
      operatorEmail={state.user.email ?? "operator"}
      mfaActive={state.aal === "aal2"}
      approvalsCount={approvalsCount}
    >
      {children}
    </AdminShell>
  );
}
