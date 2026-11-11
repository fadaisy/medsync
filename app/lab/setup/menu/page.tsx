import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HospitalProfiles } from "@/components/lab/test-menu/profiles";
import { TestMenu } from "@/components/lab/test-menu/test-menu";
import { PillTabs } from "@/components/tide/work/space";
import { LAB } from "@/content/lab";
import { LAB_TEST_MENU } from "@/content/lab-test-menu";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadTestMenuData } from "@/lib/lab/test-menu-read";
import { SetupHeader } from "../_components/setup-header";

export const metadata: Metadata = { title: "Test menu · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Set-up → Tests (Lab test menu v2, board 13 and 17; TM-U6): the same component and the same store as the hub's
 * Diagnostics → Laboratory (S9). The laboratory lead sees restricted names (gate-a-proposal §6).
 */
export default async function TestMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !scope.access.permissions.has("lab.manage")) notFound();
  const { tab } = await searchParams;
  const data = await loadTestMenuData(scope.hospitalId, "lab", true);
  const T = LAB_TEST_MENU.tabs;
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={LAB_TEST_MENU.title}
      />
      <PillTabs
        label={LAB_TEST_MENU.title}
        current={tab === "profiles" ? "profiles" : "menu"}
        tabs={[
          { key: "menu", label: T.menu, href: "/lab/setup/menu" },
          { key: "profiles", label: T.profiles, href: "/lab/setup/menu?tab=profiles" },
          { key: "catalogue", label: T.catalogue, href: "/lab/setup/catalogue" },
          { key: "analysers", label: T.analysers, href: "/lab/setup/profiles" },
        ]}
      />
      {tab === "profiles" ? <HospitalProfiles data={data} /> : <TestMenu data={data} />}
    </div>
  );
}
