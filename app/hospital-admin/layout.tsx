import type { Metadata } from "next";
import type { ReactNode } from "react";

import { TideScope } from "@/components/medsync/tide-scope";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { HospitalShell } from "./_components/hospital-shell";
import { adminNavFor } from "./_lib/admin-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Hospital-admin workspace gate.
 *
 * Defence in depth on top of `proxy.ts` (auth + AAL2 + MFA enrolment for /hospital-admin) and the database's RLS
 * (every query scoped by user_has_role/hospital_id). `requireHospitalAdminScope()` validates the session, resolves
 * the admin's hospital and refuses a hospital that is suspended, offboarded or out of agreement. Feature pages
 * re-call it server-side or read `useHospitalScope()` on the client.
 *
 * The shell is the Tether desk frame with one admin menu (ADR 0515); the menu's two counts are best-effort.
 */
export default async function HospitalAdminLayout({ children }: { children: ReactNode }) {
  const scope = await requireHospitalAdminScope();
  const { tether, groups } = await adminNavFor(scope.hospitalId);

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
      userName={scope.userEmail}
      tether={tether}
      groups={groups}
    >
      <TideScope group="hospital-admin">{children}</TideScope>
    </HospitalShell>
  );
}
