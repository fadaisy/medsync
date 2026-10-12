import type { PharmacyNavEntry } from "./_components/pharmacy-nav";
import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { sentenceCase, WorkspaceShell } from "@/components/medsync/workspace-shell";
import { PHARMACY } from "@/content/pharmacy";
import { DOWNTIME_PAGE } from "@/content/pharmacy-golive";
import { db } from "@/db";
import { POINT_COOKIE } from "@/lib/pharmacy/actor";
import { countSheetsToEnter } from "@/lib/pharmacy/downtime-store";
import { pharmacyDispensingLiveFor, pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import { pharmacyNavFor } from "@/lib/pharmacy/nav";
import { dosesCountFor, queueFor } from "@/lib/pharmacy/page-data";
import { actingPoint, pharmacyPointsFor } from "@/lib/pharmacy/points";
import { toRows } from "@/lib/pharmacy/queue";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { FindField } from "./_components/find-field";
import { PharmacyCrumb, PharmacyPhoneNav, PharmacySidebarNav } from "./_components/pharmacy-nav";
import { PointChooser } from "./_components/point-chooser";

export const metadata: Metadata = {
  title: "Pharmacy",
  robots: { index: false, follow: false },
};

/**
 * The pharmacy workspace (Pharmacy Phase 0 §5.2). `requirePharmacyScope()` enforces auth, AAL2, a
 * pharmacy-cadre affiliation, `pharmacy.view` and PHARMACY_WORKSPACE for the hospital: with the flag
 * off this is the standard not-found page (5.10). The top bar names the approved cadre, never a role
 * (Law 4), and the dispensing point when the affiliation names one. With `pharmacyDispensing` on it
 * names the acting point instead (5.1, D-PH1-45), with a chooser when the person works at several;
 * with every Phase 1 flag off nothing here reads a point (Phase 0 baseline).
 */
export default async function PharmacyLayout({ children }: { children: ReactNode }) {
  const scope = await requirePharmacyScope();
  const [today, doses] = await Promise.all([
    queueFor(scope.hospitalId, "today"),
    dosesCountFor(scope.hospitalId),
  ]);
  const written = toRows(today.lines, today.encounters, scope.hospitalId).length;
  const flags = {
    dispensing: pharmacyDispensingLiveFor(scope.hospitalId),
    downtime: pharmacyDowntimeLiveFor(scope.hospitalId),
  };
  // 5.12: the nav count of sheets still to enter, read only with the downtime flag on.
  const sheets = flags.downtime ? await countSheetsToEnter(scope.hospitalId) : 0;
  const counts: Partial<Record<PharmacyNavEntry["id"], number>> = {
    queue: written,
    emergency: doses,
    downtime: sheets,
  };
  const words: Partial<Record<PharmacyNavEntry["id"], string>> = {
    queue: PHARMACY.nav.queueCount(written),
    emergency: PHARMACY.nav.dosesCount(doses),
    downtime: DOWNTIME_PAGE.toEnter(sheets),
  };
  const nav: PharmacyNavEntry[] = pharmacyNavFor(scope.access.permissions, flags).map((i) => ({
    id: i.id,
    label: i.label,
    href: i.href,
    exact: i.exact,
    count: counts[i.id] ?? 0,
    countLabel: words[i.id] ?? "",
  }));
  const points = flags.dispensing
    ? await pharmacyPointsFor(db as unknown as EmrDb, scope.userId, scope.hospitalId)
    : [];
  const acting = points.length
    ? actingPoint(points, (await cookies()).get(POINT_COOKIE)?.value)
    : null;
  const phase0Point = scope.departmentParentCode === "PHARMACY" ? scope.departmentName : null;
  const point = points.length > 1 ? null : (acting?.name ?? phase0Point);
  const chooser =
    points.length > 1 && acting ? (
      <PointChooser
        value={acting.id}
        points={points.map((p) => ({
          id: p.id,
          name: p.name,
          live: p.liveAt !== null && p.switchedOffAt === null,
        }))}
      />
    ) : null;
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
      point={chooser}
      userName={scope.fullName ?? scope.userEmail ?? sentenceCase(scope.cadreName)}
    >
      {children}
    </WorkspaceShell>
  );
}
