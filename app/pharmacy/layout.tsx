import type { PharmacyNavEntry } from "./_components/pharmacy-nav";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { sentenceCase, WorkspaceShell } from "@/components/medsync/workspace-shell";
import { PHARMACY } from "@/content/pharmacy";
import { pharmacyNavFor } from "@/lib/pharmacy/nav";
import { dosesCountFor, queueFor } from "@/lib/pharmacy/page-data";
import { toRows } from "@/lib/pharmacy/queue";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { FindField } from "./_components/find-field";
import { PharmacyCrumb, PharmacyPhoneNav, PharmacySidebarNav } from "./_components/pharmacy-nav";

export const metadata: Metadata = {
  title: "Pharmacy",
  robots: { index: false, follow: false },
};

/**
 * The pharmacy workspace (Pharmacy Phase 0 §5.2). `requirePharmacyScope()` enforces auth, AAL2, a
 * pharmacy-cadre affiliation, `pharmacy.view` and PHARMACY_WORKSPACE for the hospital: with the flag
 * off this is the standard not-found page (5.10). The top bar names the approved cadre, never a role
 * (Law 4), and the dispensing point when the affiliation names one.
 */
export default async function PharmacyLayout({ children }: { children: ReactNode }) {
  const scope = await requirePharmacyScope();
  const [today, doses] = await Promise.all([
    queueFor(scope.hospitalId, "today"),
    dosesCountFor(scope.hospitalId),
  ]);
  const written = toRows(today.lines, today.encounters, scope.hospitalId).length;
  const counts = { queue: written, emergency: doses };
  const words = {
    queue: PHARMACY.nav.queueCount(written),
    emergency: PHARMACY.nav.dosesCount(doses),
  };
  const nav: PharmacyNavEntry[] = pharmacyNavFor(scope.access.permissions).map((i) => ({
    id: i.id,
    label: i.label,
    href: i.href,
    exact: i.exact,
    count: counts[i.id],
    countLabel: words[i.id],
  }));
  const point = scope.departmentParentCode === "PHARMACY" ? scope.departmentName : null;
  return (
    <WorkspaceShell
      hospitalName={scope.hospitalName}
      place={PHARMACY.place}
      homeHref="/pharmacy"
      navLabel={PHARMACY.nav.label}
      groupLabel={PHARMACY.nav.label}
      sidebarTop={<FindField />}
      sidebarNav={<PharmacySidebarNav items={nav} />}
      phoneNav={<PharmacyPhoneNav items={nav} />}
      crumb={<PharmacyCrumb items={nav} />}
      who={[sentenceCase(scope.cadreName), point].filter(Boolean).join(" · ")}
      userName={scope.fullName ?? scope.userEmail ?? sentenceCase(scope.cadreName)}
    >
      {children}
    </WorkspaceShell>
  );
}
