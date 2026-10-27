import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { STORE } from "@/content/pharmacy-stores-store";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyCatalogueLiveFor, pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { registrationList } from "@/lib/pharmacy/stores/receiving-store";
import { getDeliveriesPage } from "@/lib/pharmacy/stores/store-read";
import { StartDeliveryDialog } from "./_components/delivery-dialogs";

const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * Deliveries (Pharmacy Phase 2, 5.2, board 2.1): every delivery, counting first. A delivery still being counted
 * stays listed in words until it is received or abandoned (Law 11); no stock has moved for it. Behind
 * `pharmacyStore`; holders of `pharmacy.store` start and receive.
 */
export async function DeliveriesBody() {
  const actor = await requirePharmacyActor();
  if (!pharmacyStoreLiveFor(actor.hospitalId)) notFound();
  const data = await getDeliveriesPage(actor);
  // Law 9, D-CAT-08: what was received without a current registration, for the in-charge.
  const unregistered = pharmacyCatalogueLiveFor(actor.hospitalId)
    ? await asClinicalReader(actor, (tx) => registrationList(tx, actor.hospitalId))
    : null;
  const G = CATALOGUE.receive.registration;
  const canStore = actor.access.permissions.has("pharmacy.store");
  const S = STORE.deliveries;
  const counting = data.deliveries.filter((d) => d.state === "counting").length;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={S.title}
        subline={<span className="text-body-s text-muted-foreground">{S.lead}</span>}
        right={
          <>
            <Link
              href="/pharmacy/store/places"
              className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {STORE.places.title}
            </Link>
            {canStore ? (
              <StartDeliveryDialog
                suppliers={data.suppliers}
                places={data.receivingPlaces}
                orders={data.orders.map((o) => ({
                  id: o.id,
                  label: S.orderLabel(
                    o.kind === "emergency",
                    o.savedAt ? at.format(o.savedAt) : null,
                  ),
                }))}
              />
            ) : null}
          </>
        }
      />
      {counting ? (
        <p role="status">
          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
            {S.stillCounting(counting)}
          </StatusWord>
        </p>
      ) : null}
      {data.deliveries.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{S.empty}</p>
      ) : (
        <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
          <table className="text-body-s w-full">
            <thead className="bg-ink-50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {S.columns.note}
                </th>
                <th scope="col" className="px-3 py-2">
                  {S.columns.supplier}
                </th>
                <th scope="col" className="px-3 py-2">
                  {S.columns.at}
                </th>
                <th scope="col" className="px-3 py-2">
                  {S.columns.arrived}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {S.columns.lines}
                </th>
                <th scope="col" className="px-3 py-2">
                  {S.columns.state}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/pharmacy/store/deliveries/${d.id}`}
                      className="text-primary inline-flex min-h-11 items-center font-mono underline-offset-4 hover:underline"
                    >
                      {d.noteNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{d.supplier}</td>
                  <td className="px-3 py-2">{d.locationName}</td>
                  <td className="px-3 py-2">{at.format(d.arrivedAt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.lines}</td>
                  <td className="px-3 py-2">
                    {d.state === "counting" ? (
                      <StatusWord tone="caution">{S.states.counting}</StatusWord>
                    ) : (
                      <StatusWord>{S.states[d.state]}</StatusWord>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unregistered ? (
        <section aria-labelledby="unregistered" className="flex flex-col gap-2">
          <h2 id="unregistered" className="text-heading-s">
            {G.listTitle}
          </h2>
          <p className="text-body-s text-muted-foreground">{G.listLead}</p>
          {unregistered.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{G.listNone}</p>
          ) : (
            <ul className="border-border divide-border divide-y rounded-lg border">
              {unregistered.map((u) => (
                <li
                  key={`${u.delivery_id}-${u.line_no}`}
                  className="text-body-s flex flex-wrap gap-x-3 px-3 py-2"
                >
                  <Link
                    href={`/pharmacy/store/deliveries/${u.delivery_id}`}
                    className="text-primary font-mono underline-offset-4 hover:underline"
                  >
                    {u.note_number}
                  </Link>
                  <span>{u.product}</span>
                  <span>{G.reasons[u.reason as keyof typeof G.reasons] ?? u.reason}</span>
                  {u.note ? <span className="text-muted-foreground">{u.note}</span> : null}
                  {u.received_at ? (
                    <span className="text-muted-foreground">
                      {at.format(new Date(u.received_at))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
