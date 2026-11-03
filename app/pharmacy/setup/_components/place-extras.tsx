import type { PharmacyActor } from "@/lib/pharmacy/write";

import {
  CounterpartyDialog,
  InChargeDialog,
  SupplyModelDialog,
} from "@/app/pharmacy/store/places/_components/places-dialogs";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { RC } from "@/content/pharmacy-rework-records";
import { STORE } from "@/content/pharmacy-stores-store";
import { pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { getPlacesPage } from "@/lib/pharmacy/stores/store-read";
import { loadColdSetup } from "../_lib/read";
import { EpiClinicDialog, EpiVaccineDialog } from "./cold-setup";

const P = RC.setup.places;
const C = P.cold;

/**
 * Set-up › Places, below the places themselves: what SETUP-TABS §B leaves out but the pharmacy still needs — each
 * place's in-charge and ward supply model, the immunisation clinic and its vaccines, and the counterparties.
 */
export async function PlaceExtras({ actor, manages }: { actor: PharmacyActor; manages: boolean }) {
  if (!pharmacyStoreLiveFor(actor.hospitalId)) return null;
  const [data, cold] = await Promise.all([getPlacesPage(actor), loadColdSetup(actor.hospitalId)]);
  const places = data.locations
    .filter((l) => !l.switchedOffAt)
    .map((l) => ({ id: l.id, name: l.name }));
  return (
    <Panel title={P.extras} note={P.extrasLead}>
      <ul className="divide-border flex flex-col divide-y">
        {data.locations
          .filter((l) => !l.switchedOffAt && l.kind !== "cart")
          .map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-body-s">
                <span className="font-semibold">{l.name}</span>
                <span className="text-ink-700">
                  {" · "}
                  {l.kind === "ward"
                    ? l.wardSupplyModel
                      ? STORE.places.supplyModels[l.wardSupplyModel]
                      : STORE.places.supplyModelUnset
                    : (l.inChargeName ?? P.noOne)}
                </span>
              </span>
              {manages && l.kind !== "ward" ? (
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
            </li>
          ))}
      </ul>
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
      <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-body-s font-semibold">{STORE.places.counterparties}</span>
          {manages ? <CounterpartyDialog added={data.counterparties.map((c) => c.name)} /> : null}
        </div>
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
      </div>
    </Panel>
  );
}
