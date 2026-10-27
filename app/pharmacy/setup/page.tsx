import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PillTabs } from "@/app/lab/_components/v2/space";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";
import { PHWS2_SETUP as S } from "@/content/pharmacy-workspace-v2-setup";
import { setupView } from "@/lib/pharmacy/workspace-v2/setup";
import { pharmacyV2 } from "../_lib/v2";
import { ClinicalContentBody } from "../clinical/content/body";
import { DowntimeBody } from "../downtime/body";
import { NationalListBody } from "../stock/national-list/body";
import { PlacesBody } from "../store/places/body";
import { CatalogueView } from "./_components/catalogue-view";
import { GoingLiveView } from "./_components/going-live";
import { ImportView } from "./_components/import-view";
import { PacksView } from "./_components/packs-view";
import { PricesView } from "./_components/prices-view";

export const metadata: Metadata = { title: "Set-up · Pharmacy" };
export const dynamic = "force-dynamic";

/** Board order; each view exists only when its tab does (places.ts), plus Going live where there are points. */
const ORDER = [
  "packs",
  "places",
  "content",
  "national",
  "catalogue",
  "prices",
  "import",
  "downtime",
  "golive",
] as const;
type View = (typeof ORDER)[number];

/**
 * Set-up (board Setup, GATE A §3): signed packs, places and suppliers, clinical content, the national list,
 * downtime records, and a read-only Going live view. The other views render the old pages' own bodies, so every
 * action, filter and print is the same code.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await pharmacyV2();
  if (!v2.live) notFound();
  const sp = await searchParams;
  const keys = new Set<string>(v2.tabs.filter((t) => t.place === "setup").map((t) => t.key));
  if (v2.flags.dispensing) keys.add("golive");
  const views = ORDER.filter((k) => keys.has(k));
  const view = setupView(typeof sp.view === "string" ? sp.view : undefined, views) as View | null;
  if (!view) notFound();
  const words: Record<View, string> = {
    ...PHWS2.tabs.setup,
    catalogue: CATALOGUE.tab,
    prices: CATALOGUE.prices.tab,
    import: CATALOGUE.imports.tab,
    golive: S.goLive,
  };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        <PillTabs
          label={S.tabsLabel}
          current={view}
          tabs={views.map((k) => ({
            key: k,
            label: words[k],
            href: k === "packs" ? "/pharmacy/setup" : `/pharmacy/setup?view=${k}`,
          }))}
        />
      </div>
      {view === "packs" ? (
        <PacksView v2={v2} />
      ) : view === "places" ? (
        <PlacesBody />
      ) : view === "content" ? (
        <ClinicalContentBody />
      ) : view === "national" ? (
        <NationalListBody
          searchParams={Promise.resolve({ q: one("q"), kind: one("kind"), vital: one("vital") })}
        />
      ) : view === "catalogue" ? (
        <CatalogueView v2={v2} medicineId={one("medicine")} />
      ) : view === "prices" ? (
        <PricesView v2={v2} />
      ) : view === "import" ? (
        <ImportView v2={v2} draftId={one("draft")} />
      ) : view === "downtime" ? (
        <DowntimeBody />
      ) : (
        <GoingLiveView points={v2.points} />
      )}
    </>
  );
}
