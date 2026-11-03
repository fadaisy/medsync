import type { PharmacyActor } from "@/lib/pharmacy/write";

import {
  AddPlaceDialog,
  CounterpartyDialog,
  InChargeDialog,
  SupplyModelDialog,
} from "@/app/pharmacy/store/places/_components/places-dialogs";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { RC } from "@/content/pharmacy-rework-records";
import { STORE } from "@/content/pharmacy-stores-store";
import { pharmacyCatalogueLiveFor, pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { getPlacesPage } from "@/lib/pharmacy/stores/store-read";
import { loadColdSetup } from "../_lib/read";
import { AddFridgeDialog, EpiClinicDialog, EpiVaccineDialog } from "./cold-setup";
import { PointBilling } from "./point-billing";

const P = RC.setup.places;

/**
 * Set-up › Places (PRD §6.7): every stock place with its state and in-charge, and the suppliers. The old places page's
 * reads and dialogs; counting moved to Store › Count, so it is not repeated here.
 */
export async function PlacesTab({ actor, manages }: { actor: PharmacyActor; manages: boolean }) {
  if (!pharmacyStoreLiveFor(actor.hospitalId))
    return <EmptyState title={P.none} next={P.noneNext} />;
  const [data, cold] = await Promise.all([getPlacesPage(actor), loadColdSetup(actor.hospitalId)]);
  const places = data.locations
    .filter((l) => !l.switchedOffAt)
    .map((l) => ({ id: l.id, name: l.name }));
  const C = P.cold;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-s text-ink-700 max-w-prose">{P.lead}</p>
        {manages ? (
          <AddPlaceDialog units={data.units} wards={data.wards} carts={data.carts} />
        ) : null}
      </div>
      {!manages ? <p className="text-caption text-muted-foreground">{P.manageOnly}</p> : null}
      <Panel>
        {data.locations.length === 0 ? (
          <EmptyState compact title={P.none} next={P.noneNext} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {data.locations.map((l) => (
              <li
                key={l.id}
                className="grid gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="text-body-s font-semibold">{l.name}</span>
                <span className="text-caption text-ink-700">
                  {P.kinds[l.kind] ?? l.kind}
                  {l.kind === "ward" ? (
                    <span className="text-muted-foreground block">
                      {l.wardSupplyModel
                        ? STORE.places.supplyModels[l.wardSupplyModel]
                        : STORE.places.supplyModelUnset}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Pill tone="neutral" glyph={null}>
                    {l.switchedOffAt ? P.off : l.liveAt ? P.live : P.notLive}
                  </Pill>
                  <span className="text-caption text-ink-700">{l.inChargeName ?? P.noOne}</span>
                </span>
                <span className="flex flex-wrap gap-2 sm:justify-end">
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
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {pharmacyCatalogueLiveFor(actor.hospitalId) ? <PointBilling manages={manages} /> : null}
      <Panel
        title={C.title}
        action={manages && places.length ? <AddFridgeDialog places={places} /> : null}
      >
        <p className="text-body-s text-ink-700 max-w-prose pb-2">{C.lead}</p>
        {cold.fridges.length === 0 ? (
          <EmptyState compact title={C.noFridges} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {cold.fridges.map((f) => (
              <li
                key={f.id}
                className="text-body-s flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-semibold">
                    {f.code} · {f.name}
                  </span>
                  <span className="text-muted-foreground"> {f.place}</span>
                </span>
                <Pill tone="neutral" glyph={null}>
                  {f.sensor ? C.sensorYes : C.sensorNone}
                </Pill>
              </li>
            ))}
          </ul>
        )}
        <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-s">
              <span className="font-semibold">{C.clinic}: </span>
              {places.find((p) => p.id === cold.clinic)?.name ?? C.clinicNone}
            </span>
            {manages && places.length ? (
              <EpiClinicDialog places={places} current={cold.clinic} />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-s">
              <span className="font-semibold">{C.vaccines}: </span>
              {cold.vaccines
                .map((v) => `${VACCINE_NAMES[v.vaccine]} (${v.product}, ${C.perVial(v.perVial)})`)
                .join("; ") || C.vaccinesNone}
            </span>
            {manages && cold.clinic ? <EpiVaccineDialog products={cold.products} /> : null}
          </div>
        </div>
      </Panel>
      <Panel
        title={STORE.places.counterparties}
        action={
          manages ? <CounterpartyDialog added={data.counterparties.map((c) => c.name)} /> : null
        }
      >
        {data.counterparties.length === 0 ? (
          <EmptyState compact title={STORE.places.noCounterparties} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {data.counterparties.map((c) => (
              <li
                key={c.id}
                className="text-body-s flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted-foreground">
                    {STORE.places.counterpartyKinds[c.kind]}
                    {c.code ? ` · ${c.code}` : ""}
                  </span>
                  {c.takesReturns ? <Pill glyph={null}>{STORE.places.takesReturnsYes}</Pill> : null}
                  {c.retiredAt ? <Pill glyph={null}>{STORE.places.retired}</Pill> : null}
                </span>
                {manages && !c.retiredAt ? <CounterpartyDialog existing={c} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
