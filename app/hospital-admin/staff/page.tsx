import type { Metadata } from "next";

import { PEOPLE } from "@/content/hospital-admin/people";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PeopleView } from "./_components/people-view";
import {
  fetchDirectoryAffiliations,
  fetchHospitalAdmins,
  fetchHospitalDepartments,
  fetchHospitalRoles,
  fetchInvitations,
  fetchPendingAffiliations,
} from "./_lib/data";
import { peopleTab } from "./_lib/people";

export const metadata: Metadata = {
  title: PEOPLE.metaTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * People (ADR 0516 phase 2): who works here and who is asking to. Four tabs in the desk look, the tab in the URL
 * (`?tab=invites|directory|admins`; To review needs none, and the old `?tab=pending` still opens it) and an open
 * person in `?aff=`. Every write goes through the Server Actions in `actions.ts`, which forward to the staff Edge
 * Functions; the Edge Functions check the role and the hospital and write the audit row.
 */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; aff?: string }>;
}) {
  const scope = await requireHospitalAdminScope();
  const params = await searchParams;

  const [pending, invitations, directory, departments, roles, admins] = await Promise.all([
    fetchPendingAffiliations(scope.hospitalId),
    fetchInvitations(scope.hospitalId),
    fetchDirectoryAffiliations(scope.hospitalId),
    fetchHospitalDepartments(scope.hospitalId),
    fetchHospitalRoles(),
    fetchHospitalAdmins(scope.hospitalId),
  ]);

  return (
    <PeopleView
      tab={peopleTab(params.tab)}
      aff={params.aff ?? null}
      pending={pending}
      invitations={invitations}
      directory={directory}
      departments={departments}
      roles={roles}
      admins={admins}
      me={scope.userId}
    />
  );
}
