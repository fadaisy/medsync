import type { StoreSection } from "@/content/pharmacy-store";

import { ReceiveTab } from "@/components/pharmacy/receive";
import { MainStore } from "@/components/pharmacy/store/shell";
import { EmptyState } from "@/components/tide/work/kit";
import { PrimaryLink } from "@/components/tide/work/space";
import { SECTION_LABEL, ST } from "@/content/pharmacy-store";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { appDb } from "@/lib/pharmacy/audit/read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { SETUP_HREF, tabOf } from "@/lib/pharmacy/ia";
import { loadReceiveWorld } from "@/lib/pharmacy/receive/read";
import { loadStoreWorld } from "@/lib/pharmacy/store/read";
import { createServiceClient } from "@/lib/supabase/service";
import { PageTabs } from "../../_components/page-tabs";
import WardStockPage from "../../store/wards/[locationId]/page";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Store (STORE.md): Main store, one world per request with the section in the URL, and Receive a delivery. `?ward=` is
 * a place's own stock page, which raises its requisitions until the place tab exists.
 */
export default async function StorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = tabOf("store", sp.tab);
  const actor = await requirePharmacyActor();
  const delivery = one(sp.delivery);
  const ward = one(sp.ward);
  let body;
  if (tab === "receive") {
    const opened = delivery && UUID.test(delivery) ? delivery : null;
    const world = await loadReceiveWorld(appDb(), {
      hospitalId: actor.hospitalId,
      actorUserId: actor.userId,
      placeId: one(sp.place),
      deliveryId: opened,
      store: () =>
        loadStoreWorld(appDb(), { hospitalId: actor.hospitalId, actorUserId: actor.userId }),
      signPhotos: async (paths) => {
        if (!paths.length) return new Map();
        const { data } = await createServiceClient()
          .storage.from("pharmacy-delivery-photos")
          .createSignedUrls(paths, 3600);
        return new Map((data ?? []).map((x) => [x.path ?? "", x.signedUrl]));
      },
    });
    body = world ? (
      <ReceiveTab world={world} deliveryId={opened} />
    ) : (
      <EmptyState
        title={ST.shell.notReady}
        why={ST.shell.notReadyWhy}
        next={ST.shell.notReadyAsk}
      />
    );
  } else if (ward && UUID.test(ward))
    body = (
      <WardStockPage
        params={Promise.resolve({ locationId: ward })}
        searchParams={Promise.resolve({ count: one(sp.count) ?? undefined })}
      />
    );
  else {
    const asked = one(sp.section);
    const section = (asked && asked in SECTION_LABEL ? asked : "home") as StoreSection;
    const world = await loadStoreWorld(appDb(), {
      hospitalId: actor.hospitalId,
      actorUserId: actor.userId,
      medId: one(sp.med),
      cardOpen: section === "card",
    });
    body = world ? (
      <MainStore world={world} section={section} shelfId={one(sp.shelf)} />
    ) : (await managesPharmacy(actor.userId, actor.hospitalId)) ? (
      <EmptyState
        title={ST.shell.notReady}
        why={ST.shell.notReadyWhy}
        action={
          <PrimaryLink href={`${SETUP_HREF}?tab=places&add=store`}>
            {ST.shell.notReadyAdd}
          </PrimaryLink>
        }
      />
    ) : (
      <EmptyState
        title={ST.shell.notReady}
        why={ST.shell.notReadyWhy}
        next={ST.shell.notReadyAsk}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PageTabs page="store" current={tab} />
      {body}
    </div>
  );
}
