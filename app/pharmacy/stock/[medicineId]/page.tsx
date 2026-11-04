import type { DialogBatch, DialogProduct } from "../_components/stock-dialogs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { Tag } from "@/components/medsync/tag";
import { PHARMACY } from "@/content/pharmacy";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { LabButton } from "@/components/tide/work/button";
import { DELIVERY_FROM, expiryText, stateWord, STOCK } from "@/content/pharmacy-stock";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { noProductText } from "@/lib/pharmacy/catalogue";
import { controlledMedicineIds } from "@/lib/pharmacy/controlled-read";
import { pharmacyCatalogueLiveFor, pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { getStockDetail, pointsBesides } from "@/lib/pharmacy/stock/read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import {
  AddProductDialog,
  AdjustDialog,
  CorrectDialog,
  CountDialog,
  DifferenceDialog,
  FoundDialog,
  LevelDialog,
  TransferDialog,
} from "../_components/stock-dialogs";

export const dynamic = "force-dynamic";

/**
 * One medicine at the acting point (5.8's detail, as built: its own page, W10 and ADR 0161): its
 * products and batches with what each holds, today's movements, and the actions. Reorder level and
 * batch corrections are for `pharmacy.manage` (the in-charge); the rest for `pharmacy.stock`.
 */
const D = STOCK.detail;
const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});

export default async function StockMedicinePage({
  params,
}: {
  params: Promise<{ medicineId: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyDispensingLiveFor(actor.hospitalId)) notFound();
  const medicineId = decodeURIComponent((await params).medicineId);
  const point = actor.points.find((p) => p.id === actor.pointId);
  if (!point || !/^[a-z0-9_]{2,80}$/.test(medicineId)) notFound();
  const [d, points, signed] = await Promise.all([
    getStockDetail(actor, point, medicineId),
    pointsBesides(actor.hospitalId, point.id),
    controlledMedicineIds(db, actor.hospitalId),
  ]);
  if (!d) notFound();
  // CD-1, CD-5: a controlled medicine is received, counted and moved with a witness, on its own page.
  const controlled = d.controlled || signed.has(d.medicineId);
  const holdsStock = actor.access.permissions.has("pharmacy.stock");
  const canStock = holdsStock && !controlled;
  const here = d.products.filter((p) => p.atPoint);
  const dialogProducts: DialogProduct[] = here.map((p) => ({
    id: p.id,
    medicineName: d.name,
    name: p.name,
    issueUnit: p.issueUnit,
  }));
  const batches: DialogBatch[] = d.products.flatMap((p) =>
    p.batches
      .filter((b) => !(b.expired && b.balance === 0))
      .map((b) => ({
        id: b.id,
        productId: p.id,
        medicineId: d.medicineId,
        medicineName: d.name,
        batchNumber: b.batchNumber,
        expiryText: expiryText(b),
        issueUnit: p.issueUnit,
      })),
  );
  const unit = here[0]?.issueUnit ?? "";
  const state = stateWord(d.row.state, d.row.days);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <Link
        href="/pharmacy/stock"
        className="text-body-s text-ink-600 hover:text-foreground focus-visible:shadow-focus inline-flex min-h-11 w-fit items-center gap-1.5 rounded-sm outline-none"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {STOCK.actions.back}
      </Link>
      <PageHeader
        place={`${PHARMACY.place} · ${point.name}`}
        title={d.name}
        subline={
          <span className="inline-flex flex-wrap items-center gap-2">
            {d.row.state === "in_stock" ? (
              <span>{state}</span>
            ) : (
              <StatusWord tone="caution">{state}</StatusWord>
            )}
            <span>· {D.level(d.level)}</span>
          </span>
        }
        right={
          <>
            {canStock ? (
              <>
                <LabButton
                  variant="primary"
                  render={
                    <Link
                      href={`/pharmacy/stock/store?tab=receive&start=1${here[0] ? `&med=${here[0].id}` : ""}`}
                    />
                  }
                  nativeButton={false}
                >
                  {STOCK.actions.receive}
                </LabButton>
                <CountDialog
                  label={STOCK.actions.count}
                  what={d.name}
                  medicineId={d.medicineId}
                  batches={batches}
                />
                {batches.length ? <AdjustDialog what={d.name} batches={batches} /> : null}
                {batches.length && points.length ? (
                  <TransferDialog batches={batches} points={points} />
                ) : null}
                <FoundDialog what={d.name} medicineId={d.medicineId} products={dialogProducts} />
              </>
            ) : null}
            {holdsStock ? (
              <AddProductDialog
                medicineId={d.medicineId}
                catalogue={pharmacyCatalogueLiveFor(actor.hospitalId)}
              />
            ) : null}
            {d.manages ? (
              <LevelDialog what={d.name} medicineId={d.medicineId} unit={unit} current={d.level} />
            ) : null}
          </>
        }
      />

      {controlled ? (
        <CautionNotice tone="neutral" lead={STOCK.controlledWitnessed}>
          <Link
            href={`/pharmacy/controlled?medicine=${encodeURIComponent(d.medicineId)}`}
            prefetch={false}
            className="font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            {STOCK.toControlled}
          </Link>
        </CautionNotice>
      ) : null}
      {here.length === 0 ? <CautionNotice tone="neutral" lead={noProductText(point.name)} /> : null}

      {d.openDifferences.length ? (
        <section aria-labelledby="stock-differences" className="flex flex-col gap-2">
          <h2 id="stock-differences" className="text-heading-s text-foreground">
            {D.differences}
          </h2>
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {d.openDifferences.map((l) => (
              <li
                key={`${l.countId}:${l.batchId}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-body-s">
                  <span className="font-mono">{l.batchNumber}</span>:{" "}
                  <StatusWord tone="caution">{STOCK.differs(l.counted, l.recorded)}</StatusWord>
                </span>
                {canStock ? <DifferenceDialog {...l} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="stock-products" className="flex flex-col gap-3">
        <h2 id="stock-products" className="text-heading-s text-foreground">
          {D.products}
        </h2>
        {d.products.map((p) => (
          <div key={p.id} className="border-border bg-card overflow-hidden rounded-lg border">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="text-body-s text-foreground font-medium">{D.product(p)}</span>
              {p.addedAtWindow ? <Tag hue="iris">{STOCK.addedAtWindow}</Tag> : null}
              {p.atPoint ? null : <Tag>{D.notAtPoint}</Tag>}
              {pharmacyCatalogueLiveFor(actor.hospitalId) ? (
                <Link
                  href={`/pharmacy/store?tab=map&product=${p.id}`}
                  className="text-body-s text-primary ml-auto underline-offset-4 hover:underline"
                >
                  {CATALOGUE.traceTitle}
                </Link>
              ) : null}
            </div>
            {p.batches.length === 0 ? (
              <p className="text-muted-foreground text-body-s border-border border-t px-4 py-3">
                {D.noBatches}
              </p>
            ) : (
              <div className="border-border overflow-x-auto border-t">
                <table className="text-body-s w-full">
                  <caption className="sr-only">{`${D.products}: ${p.name}`}</caption>
                  <thead className="bg-muted text-muted-foreground text-left">
                    <tr>
                      <th scope="col" className="text-caption px-4 py-2 font-medium">
                        {D.columns.batch}
                      </th>
                      <th scope="col" className="text-caption px-4 py-2 font-medium">
                        {D.columns.expires}
                      </th>
                      <th scope="col" className="text-caption px-4 py-2 font-medium">
                        {D.columns.onShelf}
                      </th>
                      <th scope="col" className="px-4 py-2">
                        <span className="sr-only">{STOCK.columns.state}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {p.batches.map((b) => (
                      <tr key={b.id} className="align-middle">
                        <th scope="row" className="px-4 py-2 text-left font-mono font-normal">
                          {b.batchNumber}
                        </th>
                        <td className="px-4 py-2 font-mono">{expiryText(b)}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">
                          {b.balance}{" "}
                          <span className="text-muted-foreground text-caption">{p.issueUnit}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="flex flex-wrap items-center justify-end gap-2">
                            {b.expired && b.balance > 0 ? (
                              <StatusWord tone="caution">
                                {STOCK.expiredRemove(expiryText(b))}
                              </StatusWord>
                            ) : b.balance < 0 ? (
                              <StatusWord tone="caution">{STOCK.state.count_needed}</StatusWord>
                            ) : null}
                            {d.manages && !controlled ? <CorrectDialog batch={b} /> : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="stock-movements" className="flex flex-col gap-2">
        <h2 id="stock-movements" className="text-heading-s text-foreground">
          {D.movements}
        </h2>
        {d.movements.length === 0 ? (
          <p className="text-muted-foreground text-body-s">{D.noMovements}</p>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <caption className="sr-only">{D.movements}</caption>
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  {[
                    D.columns.time,
                    D.columns.what,
                    D.columns.quantity,
                    D.columns.batch,
                    D.columns.source,
                    D.columns.who,
                  ].map((c) => (
                    <th key={c} scope="col" className="text-caption px-4 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {d.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-mono tabular-nums">
                      {time.format(m.effectiveAt)}
                    </td>
                    <td className="px-4 py-2">{STOCK.movementKind[m.kind] ?? m.kind}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-2 font-mono">{m.batchNumber}</td>
                    <td className="px-4 py-2">
                      {m.deliveryFrom
                        ? DELIVERY_FROM[m.deliveryFrom as keyof typeof DELIVERY_FROM]
                        : (STOCK.source[m.sourceKind] ?? m.sourceKind)}
                    </td>
                    <td className="px-4 py-2">{m.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
