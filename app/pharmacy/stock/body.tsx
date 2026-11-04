import type { DialogBatch } from "./_components/stock-dialogs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveIcon, CalendarClockIcon, ClipboardCheckIcon } from "lucide-react";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { StatCard } from "@/components/medsync/stat-card";
import { MedicinesGrid } from "@/components/pharmacy/medicines/grid";
import { LabButton } from "@/components/tide/work/button";
import { PHARMACY } from "@/content/pharmacy";
import { NATIONAL_LIST } from "@/content/pharmacy-catalogue";
import { expiryText, STOCK } from "@/content/pharmacy-stock";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { controlledMedicineIds } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import {
  pharmacyCatalogueLiveFor,
  pharmacyDispensingLiveFor,
  pharmacyNationalListLiveFor,
} from "@/lib/pharmacy/feature";
import { loadMedicinesMaster } from "@/lib/pharmacy/medicines/read";
import { getStockPage } from "@/lib/pharmacy/stock/read";
import { DRUGS } from "@/lib/prescribing/formulary";
import {
  AddProductDialog,
  CloseRequestDialog,
  CountDialog,
  TransferDialog,
} from "./_components/stock-dialogs";
import { StockTable } from "./_components/stock-table";
import { tableRow } from "./_lib/rows";

/**
 * Stock at the dispensing point (5.8, artboard 1.6): the acting point's three figures, the opening
 * count, requests from other points, and one row per medicine. Behind `pharmacyDispensing`; at a
 * point that is not live it is the set-up and opening-count page. Holders of `pharmacy.stock` act;
 * every other pharmacy viewer reads it with no buttons.
 */
export async function StockBody() {
  const actor = await requirePharmacyActor();
  if (!pharmacyDispensingLiveFor(actor.hospitalId)) notFound();
  const point = actor.points.find((p) => p.id === actor.pointId);
  if (!point)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <PageHeader place={PHARMACY.place} placeInTopBar title={STOCK.title} />
        <CautionNotice tone="neutral" lead={STOCK.noPoint} />
      </div>
    );
  const now = new Date();
  const [data, signed, master] = await Promise.all([
    getStockPage(actor, point, now),
    controlledMedicineIds(db, actor.hospitalId),
    managesPharmacy(actor.userId, actor.hospitalId).then((m) => loadMedicinesMaster(actor, m)),
  ]);
  const canStock = actor.access.permissions.has("pharmacy.stock");
  // CD-5: a controlled product moves only with a witness, on the Controlled drugs page.
  const plain = (medicineId: string) =>
    !signed.has(medicineId) && !DRUGS.find((d) => d.id === medicineId)?.flags.controlled;
  const unitOf = new Map(data.products.map((p) => [p.id, p.issueUnit]));
  const batches: DialogBatch[] = data.batches
    .filter((b) => plain(b.medicineId))
    .map((b) => ({
      id: b.id,
      productId: b.productId,
      medicineId: b.medicineId,
      medicineName: b.medicineName,
      batchNumber: b.batchNumber,
      expiryText: expiryText(b),
      issueUnit: unitOf.get(b.productId) ?? "",
    }));
  const medicines = DRUGS.map((d) => ({ id: d.id, name: d.generic })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const nationalList = pharmacyNationalListLiveFor(actor.hospitalId) ? (
    <Link
      href="/pharmacy/stock/national-list"
      className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
    >
      {NATIONAL_LIST.open}
    </Link>
  ) : null;
  const F = STOCK.figures;
  const fig = data.figures;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${STOCK.title} · ${point.name}`}
        right={
          canStock ? (
            <>
              {nationalList}
              <LabButton
                variant="primary"
                render={
                  <Link href={`/pharmacy/stock/store?tab=receive&start=1&place=${point.id}`} />
                }
                nativeButton={false}
              >
                {STOCK.delivery.open}
              </LabButton>
              <CountDialog
                label={STOCK.actions.fullCount}
                what={point.name}
                medicineId={null}
                batches={batches}
              />
              <TransferDialog batches={batches} points={data.points} />
              <AddProductDialog
                medicines={medicines}
                catalogue={pharmacyCatalogueLiveFor(actor.hospitalId)}
              />
            </>
          ) : (
            nationalList
          )
        }
      />

      {data.requests.length ? (
        <section aria-labelledby="stock-requests" className="flex flex-col gap-2">
          <h2 id="stock-requests" className="text-heading-s text-foreground">
            {STOCK.requests.title}
          </h2>
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {data.requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-body-s">
                  {STOCK.requests.line(r.fromPoint, r.medicine, r.quantity)}
                </span>
                {canStock ? (
                  <span className="flex gap-2">
                    <TransferDialog
                      label={STOCK.requests.send}
                      batches={batches.filter((b) => b.medicineId === r.medicineId)}
                      points={data.points}
                      request={{ id: r.id, fromPointId: r.fromPointId, quantity: r.quantity }}
                    />
                    <CloseRequestDialog requestId={r.id} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {master.ok ? (
        // MEDICINES-TAB.md: the Set-up grid in operate mode replaces the old table and its three figures.
        <MedicinesGrid data={master} hospitalId={actor.hospitalId} mode="operate" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label={F.out}
              value={fig.out}
              icon={<ArchiveIcon />}
              hint={fig.outVital === null ? F.vitalNotImported : F.outVital(fig.outVital)}
            />
            <StatCard
              label={F.expiring(fig.lookaheadDays)}
              value={fig.lookaheadDays === null ? "—" : fig.expiringBatches}
              icon={<CalendarClockIcon />}
              hint={
                fig.lookaheadDays === null ? F.noLookahead : F.expiringHint(fig.expiringBatches)
              }
            />
            <StatCard
              label={F.counted}
              value={fig.counted}
              icon={<ClipboardCheckIcon />}
              hint={F.countedHint(fig.counted, fig.medicines)}
            />
          </div>
          <p className="text-body-s text-foreground">{STOCK.opening(data.openingMissing)}</p>

          <StockTable rows={data.rows.map((r) => tableRow(r, now))} />

          <p className="text-muted-foreground text-body-s">
            {STOCK.noLevelNeverLow} {STOCK.controlledWitnessed}
          </p>
        </>
      )}
    </div>
  );
}
