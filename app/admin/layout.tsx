import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthState } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminNavClient } from "./_components/admin-nav-client";

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

  // Pull the same role rows the page bodies will use so we know which
  // nav items to surface and pass the bit down to the client nav.
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

  return (
    <div className="bg-background flex min-h-svh w-full flex-col">
      <header className="border-border/60 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 w-full border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-300 flex-col gap-3 px-5 py-3 sm:px-8 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="font-display text-foreground text-[16px] tracking-tight transition-opacity hover:opacity-80"
            >
              MedSync
            </Link>
            <span
              className={cn(
                "inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase",
                isSuperadmin ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-teal-500 dark:bg-teal-400"
              />
              {isSuperadmin ? "Superadmin workspace" : "Hospital admin"}
            </span>
          </div>

          <AdminNavClient isSuperadmin={isSuperadmin} />

          <Link
            href="/sign-out"
            className="text-muted-foreground hover:text-foreground text-[12.5px] transition-colors"
          >
            Sign out
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

// Local cn helper — keeps the layout self-contained for the import-
// graph minimisation pattern used elsewhere in /admin.
function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
