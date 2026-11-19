import type { LabTab } from "./_components/lab-view";
import type { Metadata } from "next";

import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { labTestPricesLiveFor } from "@/lib/lab/feature";
import { chargeFor } from "@/lib/lab/prices";
import { loadTestPrices } from "@/lib/lab/prices-store";
import { loadTestMenuData } from "@/lib/lab/test-menu-read";
import {
  loadDepartments,
  loadOfferings,
  loadOpenProblems,
  standardsComparison,
} from "@/lib/services/data";
import { LabView } from "./_components/lab-view";

export const metadata: Metadata = { title: LAB_ADMIN.title };
export const dynamic = "force-dynamic";

const TABS: readonly LabTab[] = ["menu", "referrals", "hours", "imaging", "profiles", "compare"];

/**
 * Laboratory and imaging (phase 2 of ADR 0520): the hospital's test menu and its imaging services, set up from the
 * admin workspace. The menu is the same store and the same actions as the lab's Set-up → Tests (surface "hub",
 * TM-D09: the hospital admin may edit it); restricted test names stay masked for the admin (Law 6). Imaging is the
 * A.4 catalogue, folded in from the old Departments › Diagnostics tab.
 */
export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; test?: string }>;
}) {
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  // ADR 0527: prices are read only where the flag is on (the table is migration 0305).
  const pricesOn = labTestPricesLiveFor(h);
  const [menu, departments, offerings, problems, comparison, priceRows] = await Promise.all([
    loadTestMenuData(h, "hub", false),
    loadDepartments(h),
    loadOfferings(h),
    loadOpenProblems(h),
    standardsComparison(h),
    pricesOn ? loadTestPrices(h) : Promise.resolve([]),
  ]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const lab =
    departments.find(
      (d) => d.parentId === null && d.catalogueCode === "LABORATORY" && !d.archived,
    ) ?? null;
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "menu";
  return (
    <LabView
      tab={tab}
      test={tab === "menu" && typeof sp.test === "string" ? sp.test : null}
      menu={menu}
      labId={lab?.id ?? null}
      imaging={offerings.filter((o) => o.kind === "imaging")}
      problems={problems.filter((p) => p.subjectKind === "imaging")}
      imagingComparison={comparison?.rows.find((r) => r.kind === "imaging") ?? null}
      presetLabel={comparison?.preset.levelLabel ?? null}
      oneResultPath={emrV1LiveFor(h)}
      prices={
        pricesOn
          ? {
              today,
              charges: Object.fromEntries(
                menu.menu.map((o) => [o.code, chargeFor(priceRows, o.code, today)]),
              ),
            }
          : null
      }
    />
  );
}
