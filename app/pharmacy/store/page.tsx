import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NotSet, Panel } from "@/app/lab/_components/v2/kit";
import { PillTabs, SpaceHeader } from "@/app/lab/_components/v2/space";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { PHWS2_STORE as S } from "@/content/pharmacy-workspace-v2-store";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { localMonth } from "@/lib/pharmacy/stores/ledger";
import { getMonthReport } from "@/lib/pharmacy/stores/month-end-read";
import { getExpiryPage, listRecalls } from "@/lib/pharmacy/stores/recall-read";
import { getDeliveriesPage, getIssuesPage } from "@/lib/pharmacy/stores/store-read";
import { getCartsPage, listPlaces } from "@/lib/pharmacy/stores/ward-read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { FlowStrip } from "../_components/v2/pieces";
import { hasTab, pharmacyV2 } from "../_lib/v2";
import { storeFlow, storeTab } from "./_components/v2-flow";
import { CartsBody } from "./carts/body";
import { DeliveriesBody } from "./deliveries/body";
import { ExpiryBody } from "./expiry/body";
import { IssuesBody } from "./issues/body";
import { StockMapBody } from "./map/body";
import { MonthEndBody } from "./month-end/body";
import { OrdersBody } from "./orders/body";
import { WardsBody } from "./wards/body";

export const metadata: Metadata = { title: "Store · Pharmacy" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});
const monthName = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${m}T00:00:00Z`),
  );
const prevMonth = (m: string) => {
  const d = new Date(`${m}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
};

const LINK = "text-body-s text-primary font-medium underline-offset-4 hover:underline";

/**
 * Store (GATE A §3, board Store): the medicines flow, then one tab per old store page (`?tab=`), each rendering the
 * old page's own body so every dialog, filter and print stays (Law 2); below, Expiry and recall and Month end. The
 * flow reads the existing loaders (data-sources §Today "Medicines flow") for the viewer's own tabs only.
 * ponytail: the flow re-reads what the open tab's body also reads; share a per-request cache if it is slow.
 * Deliveries keep their table: "Counting {n} of {m}" needs the counted-line count, which no loader returns.
 */
export default async function StorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const v2 = await pharmacyV2();
  if (!v2.live) notFound();
  const sp = await searchParams;
  const has = (k: string) => hasTab(v2, "store", k);
  const tab = storeTab(sp, has);
  if (!tab) notFound();

  const actor = await requirePharmacyActor();
  const h = actor.hospitalId;
  const owner = db as unknown as EmrDb;
  const now = new Date();
  const lastMonth = prevMonth(localMonth(now));
  const [deliveries, issues, wards, carts, expiry, recalls, month] = await Promise.all([
    has("deliveries") ? getDeliveriesPage(actor) : null,
    has("issues") ? getIssuesPage(actor) : null,
    has("wards") ? listPlaces(owner, h, "ward") : null,
    has("carts") ? getCartsPage(owner, h, now) : null,
    has("expiry") ? getExpiryPage(actor, now) : null,
    has("expiry") ? listRecalls(actor) : null,
    has("monthEnd") ? getMonthReport(actor, { kind: "hospital" }, lastMonth) : null,
  ]);
  const flow = storeFlow({
    deliveries: deliveries?.deliveries ?? null,
    issues,
    wards,
    carts: carts?.rows ?? null,
    now,
  });

  const tabs = v2.tabs
    .filter((t) => t.place === "store")
    .map((t) => ({
      key: t.key,
      label:
        t.key === "map"
          ? CATALOGUE.map.title
          : ((PHWS2.tabs.store as Record<string, string>)[t.key] ?? t.key),
      href: t.href,
    }));

  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp))
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  const here = `/pharmacy/store${q.size ? `?${q}` : ""}`;

  const openRecalls = recalls?.filter((r) => !r.closedAt).length ?? 0;
  const expiringN = expiry?.expiring.reduce((a, l) => a + l.rows.length, 0) ?? 0;
  const E = S.expiry;

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-6 sm:px-6">
        <Panel
          title={S.flow.title}
          note={`${S.flow.note} ${fill(S.asOf, { time: time.format(now) })}`}
          action={
            <Link href={here} className={LINK}>
              {S.refresh}
            </Link>
          }
        >
          <FlowStrip steps={flow} label={S.flow.label} />
        </Panel>
        <SpaceHeader className="mb-0" tabs={<PillTabs tabs={tabs} current={tab} label={S.tabsLabel} />} />
      </div>

      {tab === "map" ? (
        <StockMapBody
          product={typeof sp.product === "string" ? sp.product : undefined}
          show={typeof sp.show === "string" ? sp.show : undefined}
        />
      ) : tab === "deliveries" ? (
        <DeliveriesBody />
      ) : tab === "issues" ? (
        <IssuesBody />
      ) : tab === "wards" ? (
        <WardsBody />
      ) : tab === "carts" ? (
        <CartsBody />
      ) : tab === "expiry" ? (
        <ExpiryBody />
      ) : tab === "orders" ? (
        <OrdersBody />
      ) : (
        <MonthEndBody searchParams={Promise.resolve(sp as { place?: string; month?: string })} />
      )}

      {expiry || month ? (
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-6 sm:px-6 md:grid-cols-2">
          {expiry ? (
            <Panel
              title={E.title}
              action={
                <Link href="/pharmacy/store?tab=expiry" className={LINK}>
                  {E.open}
                </Link>
              }
            >
              <ul className="text-body-s flex flex-col gap-2">
                <li>
                  {openRecalls === 0
                    ? E.recallsNone
                    : openRecalls === 1
                      ? E.recallsOne
                      : fill(E.recalls, { n: openRecalls })}
                </li>
                <li>
                  {expiry.lookaheadDays === null ? (
                    <NotSet label={E.lookaheadNotSet} href="/pharmacy/store?tab=expiry" canSet={false} />
                  ) : expiringN === 1 ? (
                    E.expiringOne
                  ) : (
                    fill(E.expiring, { n: expiringN })
                  )}
                </li>
                {expiry.expired.length ? <li>{fill(E.expired, { n: expiry.expired.length })}</li> : null}
                {expiry.quarantine.length ? (
                  <li>{fill(E.quarantine, { n: expiry.quarantine.length })}</li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
          {month ? (
            <Panel
              title={S.monthEnd.title}
              action={
                <Link href="/pharmacy/store?tab=monthEnd" className={LINK}>
                  {S.monthEnd.open}
                </Link>
              }
            >
              <p className="text-body-s">
                {month.closed
                  ? fill(S.monthEnd.closed, {
                      month: monthName(lastMonth),
                      date: day.format(month.closed.closedAt),
                    })
                  : fill(S.monthEnd.notClosed, { month: monthName(lastMonth) })}
              </p>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
