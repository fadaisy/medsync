import type { Metadata } from "next";

import { MedicinesGrid } from "@/components/pharmacy/medicines/grid";
import { RosterTab } from "@/components/pharmacy/roster/roster-tab";
import { GoLiveTab } from "@/components/pharmacy/setup/going-live";
import { MessagesTab } from "@/components/pharmacy/setup/messages";
import { PlacesTab } from "@/components/pharmacy/setup/places";
import { RulesTab } from "@/components/pharmacy/setup/rules";
import { EmptyState } from "@/components/tide/work/kit";
import { PillTabs } from "@/components/tide/work/space";
import { MEDICINES } from "@/content/pharmacy-medicines";
import { RW } from "@/content/pharmacy-rework";
import { RC } from "@/content/pharmacy-rework-records";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { appDb } from "@/lib/pharmacy/audit/read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { SETUP_HREF, SETUP_TABS } from "@/lib/pharmacy/ia";
import { loadMedicinesMaster, permissionsFor } from "@/lib/pharmacy/medicines/read";
import { rosterView } from "@/lib/pharmacy/roster/view";
import { loadGoLive, loadMessages, loadPlaces, loadRulesView } from "@/lib/pharmacy/setup/read";
import { supplyFlagOn } from "@/lib/pharmacy/stores/supply-action";
import { pharmacyV2 } from "../_lib/v2";
import { PacksView } from "./_components/packs-view";
import { PlaceExtras } from "./_components/place-extras";
import { SetupLive } from "./_components/setup-live";
import { loadPeople } from "./_lib/read";

export const metadata: Metadata = { title: "Set-up · Pharmacy" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type Tab = (typeof SETUP_TABS)[number];
const LABELS = RW.tabs.setup as Record<string, string>;
/** The old tab names keep working. */
const ALIAS: Record<string, Tab> = { live: "going-live", sms: "messages" };

/**
 * Set-up (SETUP-TABS.md): Going live, Places, Medicines, Rules, People and roster, Messages. Only the active tab's data
 * is read; every rule comes from the one registry and changes with two signatures. The shell owns the heading.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const asked = typeof sp.tab === "string" ? (ALIAS[sp.tab] ?? sp.tab) : null;
  const tab: Tab = SETUP_TABS.find((t) => t === asked) ?? "going-live";
  const actor = await requirePharmacyActor();
  const manages = await managesPharmacy(actor.userId, actor.hospitalId);
  const db = appDb();

  let body;
  if (tab === "going-live") body = <GoLiveTab view={await loadGoLive(db, actor, manages)} />;
  else if (tab === "places") {
    const [view, rules] = await Promise.all([
      loadPlaces(db, actor, manages),
      loadRulesView(db, actor, manages),
    ]);
    body = (
      <>
        <SetupLive hospitalId={actor.hospitalId} />
        <PlacesTab view={view} rules={rules} addStore={sp.add === "store"} />
        <PlaceExtras actor={actor} manages={manages} />
      </>
    );
  } else if (tab === "medicines") body = <MedicinesTab actor={actor} manages={manages} />;
  else if (tab === "rules")
    body = (
      <>
        <RulesTab view={await loadRulesView(db, actor, manages)} />
        {supplyFlagOn("packs", actor.hospitalId) ? <PacksView v2={await pharmacyV2()} /> : null}
      </>
    );
  else if (tab === "people") body = <PeopleTab actor={actor} manages={manages} sp={sp} />;
  else
    body = (
      <>
        <SetupLive hospitalId={actor.hospitalId} />
        <MessagesTab view={await loadMessages(db, actor, manages)} />
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      <PillTabs
        label={RC.setup.tabsLabel}
        current={tab}
        tabs={SETUP_TABS.map((t) => ({
          key: t,
          label: LABELS[t] ?? t,
          href: `${SETUP_HREF}?tab=${t}`,
        }))}
      />
      {body}
    </div>
  );
}

async function MedicinesTab({
  actor,
  manages,
}: {
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>;
  manages: boolean;
}) {
  const data = await loadMedicinesMaster(actor, manages);
  if (!data.ok) return <EmptyState title={MEDICINES.refused.migration} />;
  return <MedicinesGrid data={data} hospitalId={actor.hospitalId} mode="edit" />;
}

async function PeopleTab({
  actor,
  manages,
  sp,
}: {
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>;
  manages: boolean;
  sp: SP;
}) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [view, { prescribers, staff }] = await Promise.all([
    rosterView(appDb(), actor.hospitalId, actor.userId, manages, {
      week: one("week"),
      month: one("month"),
    }),
    loadPeople(actor.hospitalId),
  ]);
  const listed = new Set(view.people.map((p) => p.userId));
  return (
    <RosterTab
      view={{ ...view, staff: staff.filter((s) => !listed.has(s.userId)) }}
      prescribers={prescribers}
      can={permissionsFor(actor, manages)}
    />
  );
}
