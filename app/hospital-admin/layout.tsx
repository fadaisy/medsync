import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { availabilityCount } from "@/lib/services/data";
import { HospitalShell } from "./_components/hospital-shell";
import { getHospitalPendingStaffCount } from "./_lib/staff-pending-count";
import { TideScope } from "@/components/medsync/tide-scope";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Hospital-admin workspace gate.
 *
 * Defence in depth on top of `proxy.ts` (which enforces auth + AAL2 +
 * MFA enrolment for /hospital-admin) and on top of the database's
 * RLS policies (which scope every query by user_has_role/hospital_id).
 *
 * The single piece of logic here is `requireHospitalAdminScope()` —
 * the kickoff's "shell establishes the scope once and exposes it to
 * every feature" rule, made literal. The helper:
 *
 *   1. validates auth + AAL2 (and bounces appropriately if not)
 *   2. resolves the admin's hospital from user_roles + hospital_admin_roster
 *   3. refuses to return a scope when the hospital is in a non-reachable
 *      state (suspended / offboarded / agreement_expired)
 *
 * What this layout does NOT do:
 *
 *   - It does not branch by feature area. The feature area is decided
 *     by the child route. Feature pages get scope by re-calling
 *     `requireHospitalAdminScope()` server-side (idempotent + cheap)
 *     or by reading `useHospitalScope()` from client components inside
 *     the HospitalScopeProvider that the shell wraps.
 *   - It does not contain feature business logic. Per the kickoff this
 *     is the SHELL only.
 */
export default async function HospitalAdminLayout({ children }: { children: ReactNode }) {
  const scope = await requireHospitalAdminScope();

  // Live staff-pending count for the sidebar badge. Best-effort —
  // failure resolves to 0 so a flaky DB never blocks chrome render.
  const [staffPendingCount, servicesProblemCount] = await Promise.all([
    getHospitalPendingStaffCount(scope.hospitalId),
    availabilityCount(scope.hospitalId),
  ]);

  return (
    <HospitalShell
      scope={{
        hospitalId: scope.hospitalId,
        hospitalSlug: scope.hospitalSlug,
        hospitalName: scope.hospitalName,
        level: scope.level,
        state: scope.state,
        designation: scope.designation,
      }}
      adminEmail={scope.userEmail}
      mfaActive
      staffPendingCount={staffPendingCount}
      servicesProblemCount={servicesProblemCount}
    >
      <TideScope group="hospital-admin">{children}</TideScope>
    </HospitalShell>
  );
}
