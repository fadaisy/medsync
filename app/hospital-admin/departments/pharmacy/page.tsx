import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { GOLIVE } from "@/content/pharmacy-golive";
import { STORE } from "@/content/pharmacy-stores-store";
import { db } from "@/db";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { isDemoHospital } from "@/lib/lab/demo";
import { pharmacyDispensingLiveFor, storesFlagsFor } from "@/lib/pharmacy/feature";
import { hospitalSettings, pointsWithState } from "@/lib/pharmacy/golive/read";
import { liveSmsAllowed } from "@/lib/pharmacy/golive/store";
import { locationsForGoLive, otherAdmins } from "@/lib/pharmacy/stores/location-store";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { HospitalSettingsForm, WithoutPharmacist } from "./_components/golive-controls";
import {
  BriefingDialog,
  ConditionList,
  DrillDialog,
  SwitchLocation,
} from "./_components/location-golive";

export const metadata: Metadata = { title: "Pharmacy settings · MedSync" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});

/**
 * Pharmacy settings (Pharmacy Phase 1, 5.13, Section 8 `updatePharmacySettings`): the hospital's own
 * switches, "supply without a pharmacist" (two admins, legal question 1), and each dispensing point
 * with its live state and its going-live page. Behind `pharmacyDispensing`. No PHI.
 */
export default async function PharmacySettingsPage() {
  const scope = await requireHospitalAdminScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const database = db as unknown as EmrDb;
  const [points, settings, sms, demo] = await Promise.all([
    pointsWithState(database, scope.hospitalId),
    hospitalSettings(database, scope.hospitalId),
    database.transaction((tx) =>
      liveSmsAllowed(
        tx as unknown as EmrTx,
        scope.hospitalId,
        process.env.VERCEL_ENV === "production",
      ),
    ),
    isDemoHospital(database, scope.hospitalId),
  ]);
  // Pharmacy Phase 2, 5.12: stores and quarantine (pharmacyStore), wards (pharmacyWardStock), carts (pharmacyCarts).
  const flags = storesFlagsFor(scope.hospitalId);
  const kinds = [
    ...(flags.store ? (["store", "quarantine"] as const) : []),
    ...(flags.wardStock ? (["ward"] as const) : []),
    ...(flags.carts ? (["cart"] as const) : []),
  ];
  const [places, admins] = kinds.length
    ? await database.transaction(
        async (tx) =>
          [
            await locationsForGoLive(tx as unknown as EmrTx, scope.hospitalId, kinds),
            await otherAdmins(tx as unknown as EmrTx, scope.hospitalId, scope.userId),
          ] as const,
      )
    : [[], []];
  const without = settings?.supplyWithoutPharmacist
    ? "on"
    : settings?.supplyWithoutPharmacistRequestedBy
      ? settings.supplyWithoutPharmacistRequestedBy === scope.userId
        ? "requested_by_me"
        : "requested"
      : "off";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/hospital-admin/departments"
          className="text-body-s text-teal-700 underline-offset-4 hover:underline"
        >
          {GOLIVE.backToHub}
        </Link>
        <h1 className="text-heading-m">{GOLIVE.settingsTitle}</h1>
        <p className="text-body-s text-muted-foreground max-w-[70ch]">{GOLIVE.settingsLead}</p>
        {demo ? (
          <Link
            href="/hospital-admin/departments/pharmacy/demo"
            className="text-body-s w-fit text-teal-700 underline-offset-4 hover:underline"
          >
            Load the pharmacy demo (demo hospital)
          </Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-2" aria-labelledby="ph-points">
        <h2 id="ph-points" className="text-heading-s">
          {GOLIVE.pointsHeading}
        </h2>
        <ul className="border-border divide-border text-body-s divide-y rounded-lg border">
          {points.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <StatusWord>
                  {p.switchedOffAt
                    ? GOLIVE.state.off(day.format(p.switchedOffAt))
                    : p.liveAt
                      ? GOLIVE.state.live(day.format(p.liveAt))
                      : GOLIVE.state.notLive}
                </StatusWord>
              </span>
              <Link
                href={`/hospital-admin/departments/pharmacy/${p.id}`}
                className="inline-flex min-h-11 items-center text-teal-700 underline-offset-4 hover:underline"
              >
                {GOLIVE.open}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {kinds.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="ph-locations">
          <h2 id="ph-locations" className="text-heading-s">
            {STORE.golive.heading}
          </h2>
          <p className="text-body-s text-muted-foreground max-w-[70ch]">
            {STORE.golive.lead} {STORE.golive.noMovements}
          </p>
          {places.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{STORE.golive.none}</p>
          ) : (
            <ul className="border-border divide-border divide-y rounded-lg border">
              {places.map(({ location: l, conditions }) => {
                const live = l.liveAt !== null && l.switchedOffAt === null;
                const issueOnly = l.kind === "ward" && l.wardSupplyModel === "issue_only";
                return (
                  <li key={l.id} className="flex flex-col gap-2 px-3 py-3">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{l.name}</span>
                        <StatusWord>
                          {l.switchedOffAt
                            ? GOLIVE.state.off(day.format(l.switchedOffAt))
                            : l.liveAt
                              ? GOLIVE.state.live(day.format(l.liveAt))
                              : GOLIVE.state.notLive}
                        </StatusWord>
                      </span>
                      {issueOnly ? null : (
                        <span className="flex flex-wrap gap-2">
                          <BriefingDialog locationId={l.id} name={l.name} />
                          {l.kind === "store" ? (
                            <DrillDialog locationId={l.id} name={l.name} />
                          ) : null}
                          <SwitchLocation
                            locationId={l.id}
                            name={l.name}
                            live={live}
                            ready={conditions.every((c) => c.met)}
                            admins={admins}
                          />
                        </span>
                      )}
                    </span>
                    <ConditionList conditions={conditions} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="ph-hospital">
        <h2 id="ph-hospital" className="text-heading-s">
          {GOLIVE.hospital.heading}
        </h2>
        <HospitalSettingsForm
          initial={{
            individualInpatientSupply: settings?.individualInpatientSupply ?? false,
            paymentStatusRequired: settings?.paymentStatusRequired ?? false,
            expiryLookaheadDays: settings?.expiryLookaheadDays ?? null,
            liveSms: settings?.liveSms ?? false,
          }}
          smsAllowed={sms.allowed}
        />
        <WithoutPharmacist state={without} />
      </section>
    </div>
  );
}
