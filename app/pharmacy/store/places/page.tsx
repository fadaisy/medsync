import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { expiryText } from "@/content/pharmacy-stock";
import { LOCATION_KIND_WORDS, STORE } from "@/content/pharmacy-stores-store";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { witnessCandidates } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { getPlacesPage } from "@/lib/pharmacy/stores/store-read";
import {
  AddPlaceDialog,
  CounterpartyDialog,
  InChargeDialog,
  OpeningCountDialog,
  StoreCountDialog,
  SupplyModelDialog,
} from "./_components/places-dialogs";

export const metadata: Metadata = { title: "Places and suppliers · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

/**
 * Places and suppliers (Pharmacy Phase 2, 5.1, LC-1, LC-2): every stock location with its live state and in-charge,
 * a blind count at a store or quarantine (and a store's opening count before it goes live), and the suppliers and
 * facilities stock comes from or goes to. `pharmacy.view` reads; `pharmacy.manage` changes; `pharmacy.stock` counts.
 */
export default async function PlacesPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyStoreLiveFor(actor.hospitalId)) notFound();
  const [data, manages, witnesses] = await Promise.all([
    getPlacesPage(actor),
    managesPharmacy(actor.userId, actor.hospitalId),
    witnessCandidates(db, actor.hospitalId, actor.userId),
  ]);
  const canStock = actor.access.permissions.has("pharmacy.stock");
  const controlled = new Map(data.products.map((p) => [p.id, p.controlled]));
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={STORE.places.title}
        subline={
          <span className="text-body-s text-muted-foreground max-w-[70ch]">
            {STORE.places.lead}
          </span>
        }
        right={
          manages ? (
            <AddPlaceDialog units={data.units} wards={data.wards} carts={data.carts} />
          ) : undefined
        }
      />
      {!manages ? (
        <p className="text-body-s text-muted-foreground">{STORE.places.manageOnly}</p>
      ) : null}

      <section aria-labelledby="places" className="flex flex-col gap-2">
        <h2 id="places" className="text-heading-s">
          {STORE.places.locations}
        </h2>
        {data.locations.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{STORE.places.noLocations}</p>
        ) : (
          <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <thead className="bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    {STORE.places.name}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {STORE.places.kind}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {STORE.places.inCharge}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{STORE.places.count}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {data.locations.map((l) => {
                  const countable = l.kind === "store" || l.kind === "quarantine";
                  const batches = data.countBatches
                    .filter((b) => b.locationId === l.id)
                    .map((b) => ({
                      id: b.id,
                      productName: b.productName,
                      issueUnit: b.issueUnit,
                      batchNumber: b.batchNumber,
                      expiryText: expiryText(b),
                      controlled: !!controlled.get(b.productId),
                    }));
                  return (
                    <tr key={l.id} className="align-top">
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-1">
                          <span className="font-medium">{l.name}</span>
                          <StatusWord>
                            {l.switchedOffAt
                              ? STORE.places.off(day.format(l.switchedOffAt))
                              : l.liveAt
                                ? STORE.places.live(day.format(l.liveAt))
                                : STORE.places.notLive}
                          </StatusWord>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-1">
                          {LOCATION_KIND_WORDS[l.kind]}
                          {l.kind === "ward" ? (
                            <span className="text-muted-foreground">
                              {l.wardSupplyModel
                                ? STORE.places.supplyModels[l.wardSupplyModel]
                                : STORE.places.supplyModelUnset}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">{l.inChargeName ?? STORE.places.noInCharge}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap justify-end gap-2">
                          {manages && l.kind !== "ward" && l.kind !== "cart" ? (
                            <InChargeDialog
                              locationId={l.id}
                              name={l.name}
                              staff={data.staff}
                              current={l.inChargeUserId}
                            />
                          ) : null}
                          {manages && l.kind === "ward" && !l.wardSupplyModel ? (
                            <SupplyModelDialog locationId={l.id} name={l.name} />
                          ) : null}
                          {canStock && l.kind === "store" && !l.live ? (
                            <OpeningCountDialog
                              locationId={l.id}
                              name={l.name}
                              products={data.products.filter((p) => p.active)}
                              witnesses={witnesses}
                            />
                          ) : null}
                          {canStock && countable && l.live ? (
                            <StoreCountDialog
                              locationId={l.id}
                              name={l.name}
                              batches={batches}
                              witnesses={witnesses}
                            />
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="counterparties" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="counterparties" className="text-heading-s">
            {STORE.places.counterparties}
          </h2>
          {manages ? <CounterpartyDialog /> : null}
        </div>
        {data.counterparties.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{STORE.places.noCounterparties}</p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {data.counterparties.map((c) => (
              <li
                key={c.id}
                className="text-body-s flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">
                    {STORE.places.counterpartyKinds[c.kind]}
                    {c.code ? ` · ${c.code}` : ""}
                  </span>
                  {c.takesReturns ? <StatusWord>{STORE.places.takesReturnsYes}</StatusWord> : null}
                  {c.retiredAt ? <StatusWord>{STORE.places.retired}</StatusWord> : null}
                </span>
                {manages && !c.retiredAt ? <CounterpartyDialog existing={c} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="text-body-s flex flex-wrap gap-4">
        <Link
          href="/pharmacy/store/deliveries"
          className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        >
          {STORE.deliveries.title}
        </Link>
        <Link
          href="/pharmacy/store/issues"
          className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        >
          {STORE.issues.title}
        </Link>
      </nav>
    </div>
  );
}
