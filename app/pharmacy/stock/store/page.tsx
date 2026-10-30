import { EmptyState } from "@/components/tide/work/kit";
import { STORE } from "@/content/pharmacy-rework-daily";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { tabOf } from "@/lib/pharmacy/ia";
import { PageTabs } from "../../_components/page-tabs";
import DeliveryPage from "../../store/deliveries/[id]/page";
import { DeliveriesBody } from "../../store/deliveries/body";
import { IssuesBody } from "../../store/issues/body";
import { OrdersBody } from "../../store/orders/body";
import { WardsBody } from "../../store/wards/body";
import { CountTab } from "./_components/count-tab";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Store (rework PRD §6.4): Receive, Issue, Count, Order and Cold chain. Receive and Issue render the store's own
 * bodies (saved as you go, GRN, ward requests and receipt confirmation); Count is the resumable sheet.
 */
export default async function StorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = tabOf("store", sp.tab);
  const actor = await requirePharmacyActor();
  const delivery = one(sp.delivery);
  const count = one(sp.count);
  let body;
  if (tab === "receive")
    body =
      delivery && UUID.test(delivery) ? (
        <DeliveryPage params={Promise.resolve({ id: delivery })} />
      ) : (
        <DeliveriesBody />
      );
  else if (tab === "issue")
    body = (
      <div className="flex flex-col gap-4">
        <IssuesBody />
        <WardsBody />
      </div>
    );
  else if (tab === "count")
    body = (
      <CountTab
        hospitalId={actor.hospitalId}
        userId={actor.userId}
        sheetId={count && UUID.test(count) ? count : null}
        canApprove={await managesPharmacy(actor.userId, actor.hospitalId)}
      />
    );
  else if (tab === "order") body = <OrdersBody />;
  else body = <EmptyState title={STORE.coldSoon} />;
  return (
    <div className="flex flex-col gap-4">
      <PageTabs page="store" current={tab} />
      {body}
    </div>
  );
}
