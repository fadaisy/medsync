import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { STORES_B } from "@/content/pharmacy-stores";
import { SUPPLY_COMMON as C, EXPIRY, RECALL } from "@/content/pharmacy-stores-supply";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { controlledMedicineIds } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyRecallLiveFor } from "@/lib/pharmacy/feature";
import { expiresOn } from "@/lib/pharmacy/stock/ledger";
import { columnsFor, peopleAt, reasonList } from "@/lib/pharmacy/stores/packs";
import { getExpiryPage } from "@/lib/pharmacy/stores/recall-read";
import { drugById } from "@/lib/prescribing/formulary";
import {
  DisposalDialog,
  ExpiryPrint,
  QuarantineDialog,
  SupplierReturnDialog,
  WriteOffDialog,
} from "./_components/expiry-dialogs";

export const metadata: Metadata = { title: "Expiry and recall · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

/**
 * Expiry, quarantine and write-off (5.6, board 2.6 expiry side; EX-1, EX-2). Behind `pharmacyRecall`. Expiring stock
 * by place with the suggested actions; expired stock to move to quarantine; quarantine (what, why, since when);
 * write-offs with their register entry (printed, logged) and the disposal reference. Amber with an icon and a word
 * for every block; no red, nothing green (Law 13).
 */
export default async function ExpiryPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyRecallLiveFor(actor.hospitalId)) notFound();
  const owner = db as unknown as EmrDb;
  const [page, manages, people, quarantineReasons, writeOffReasons, controlled, registerCols] =
    await Promise.all([
      getExpiryPage(actor, new Date()),
      managesPharmacy(actor.userId, actor.hospitalId),
      peopleAt(owner, actor.hospitalId),
      reasonList(owner, actor.hospitalId, "quarantine"),
      reasonList(owner, actor.hospitalId, "write_off"),
      controlledMedicineIds(owner, actor.hospitalId),
      columnsFor(owner, actor.hospitalId, "hmis_088"),
    ]);
  const canStock = actor.access.permissions.has("pharmacy.stock");
  const { ledger } = page;
  const batch = (id: string) => ledger.batches.find((b) => b.id === id);
  const what = (id: string) => {
    const b = batch(id);
    return b ? `${ledger.products.get(b.productId)?.name ?? ""} · ${b.batchNumber}` : id;
  };
  const isControlled = (id: string) => {
    const m = batch(id)?.medicineId ?? "";
    return controlled.has(m) || !!drugById(m)?.flags.controlled;
  };
  const place = (id: string) => ledger.locations.get(id)?.name ?? id;
  const others = people.filter((p) => p.userId !== actor.userId);
  const qOptions = (quarantineReasons ?? []).map((r) => ({ value: r.code, label: r.words }));
  const woOptions = (writeOffReasons ?? []).map((r) => ({ value: r.code, label: r.words }));
  const suppliers = page.suppliers.map((s) => ({ value: s.id, label: s.name }));
  const S = EXPIRY.sections;
  const head = (cols: string[]) => (
    <thead className="bg-ink-50 text-left">
      <tr>
        {cols.map((c, i) => (
          <th key={i} scope="col" className="px-3 py-2">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
  const box = "border-border overflow-x-auto rounded-lg border";
  const cell = "px-3 py-2";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={EXPIRY.title}
        right={
          <Link
            href="/pharmacy/store/expiry/recalls"
            className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            {RECALL.title}
          </Link>
        }
      />
      {canStock && !quarantineReasons ? <CautionNotice lead={EXPIRY.noQuarantineList} /> : null}

      <section aria-labelledby="expiring" className="flex flex-col gap-2 print:hidden">
        <h2 id="expiring" className="text-heading-s">
          {S.expiring}
        </h2>
        {page.lookaheadDays === null ? (
          <CautionNotice lead={EXPIRY.noLookahead} />
        ) : page.expiring.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{C.none}</p>
        ) : (
          page.expiring.map((g) => (
            <div key={g.locationId} className={box} tabIndex={0}>
              <table className="text-body-s w-full">
                <caption className="text-body-s px-3 py-2 text-left">{place(g.locationId)}</caption>
                {head([C.batch, C.expiry, C.quantity, EXPIRY.suggested])}
                <tbody className="divide-border divide-y">
                  {g.rows.map((r) => (
                    <tr key={r.batchId}>
                      <th scope="row" className={`${cell} text-left font-normal`}>
                        {what(r.batchId)}
                      </th>
                      <td className={cell}>
                        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                          {EXPIRY.expiresIn(r.daysLeft)}
                        </StatusWord>
                      </td>
                      <td className={`${cell} tabular-nums`}>{r.quantity}</td>
                      <td className={cell}>
                        {r.actions
                          .map((a) => EXPIRY.actions[a as keyof typeof EXPIRY.actions])
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="expired" className="flex flex-col gap-2 print:hidden">
        <h2 id="expired" className="text-heading-s">
          {S.expired}
        </h2>
        {page.expired.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{C.none}</p>
        ) : (
          <div className={box} tabIndex={0}>
            <table className="text-body-s w-full">
              {head([C.batch, C.location, C.quantity, C.status, C.actions])}
              <tbody className="divide-border divide-y">
                {page.expired.map((r) => {
                  const b = batch(r.batchId)!;
                  return (
                    <tr key={r.batchId}>
                      <th scope="row" className={`${cell} text-left font-normal`}>
                        {what(r.batchId)}
                      </th>
                      <td className={cell}>{place(r.locationId)}</td>
                      <td className={`${cell} tabular-nums`}>{r.quantity}</td>
                      <td className={cell}>
                        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                          {EXPIRY.expiredOn(expiresOn(b))}
                        </StatusWord>
                      </td>
                      <td className={cell}>
                        {canStock && qOptions.length ? (
                          <QuarantineDialog
                            locationId={r.locationId}
                            batchId={r.batchId}
                            what={what(r.batchId)}
                            max={r.quantity}
                            reasons={qOptions}
                            controlled={isControlled(r.batchId)}
                            people={others}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="quarantine" className="flex flex-col gap-2 print:hidden">
        <h2 id="quarantine" className="text-heading-s">
          {S.quarantine}
        </h2>
        {manages && !writeOffReasons ? <CautionNotice lead={EXPIRY.noReasonList} /> : null}
        {page.quarantine.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{C.none}</p>
        ) : (
          <div className={box} tabIndex={0}>
            <table className="text-body-s w-full">
              {head([C.batch, EXPIRY.held, EXPIRY.why, EXPIRY.since, C.actions])}
              <tbody className="divide-border divide-y">
                {page.quarantine.map((r) => (
                  <tr key={r.batchId}>
                    <th scope="row" className={`${cell} text-left font-normal`}>
                      {what(r.batchId)}
                    </th>
                    <td className={`${cell} tabular-nums`}>{r.quantity}</td>
                    <td className={cell}>
                      <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                        {EXPIRY.reasons[r.reason as keyof typeof EXPIRY.reasons] ?? r.reason ?? "—"}
                      </StatusWord>
                    </td>
                    <td className={cell}>{r.since ? day.format(r.since) : "—"}</td>
                    <td className={cell}>
                      {manages ? (
                        <span className="flex flex-wrap gap-2">
                          {woOptions.length ? (
                            <WriteOffDialog
                              batchId={r.batchId}
                              what={what(r.batchId)}
                              max={r.quantity}
                              reasons={woOptions}
                              people={others}
                            />
                          ) : null}
                          <SupplierReturnDialog
                            batchId={r.batchId}
                            what={what(r.batchId)}
                            max={r.quantity}
                            suppliers={suppliers}
                            controlled={isControlled(r.batchId)}
                            people={others}
                          />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="write-offs" className="flex flex-col gap-2">
        <h2 id="write-offs" className="text-heading-s print:hidden">
          {S.writeOffs}
        </h2>
        {page.writeOffs.length === 0 ? (
          <p className="text-body-s text-muted-foreground print:hidden">{C.none}</p>
        ) : (
          page.writeOffs.map((w) => (
            <article
              key={w.id}
              data-print-section={`wo-${w.id}`}
              className="border-border flex flex-col gap-2 rounded-lg border p-3"
            >
              <h3 className="text-body-s">{`${EXPIRY.registerTitle} · ${w.registerNumber}`}</h3>
              {registerCols ? null : (
                <p className="text-caption">
                  {STORES_B.columnsUnconfirmed("Expired or Spoiled Medicines Register (HMIS 088)")}
                </p>
              )}
              <dl className="text-body-s grid gap-x-4 gap-y-1 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">{C.batch}</dt>
                  <dd>{w.batchId ? what(w.batchId) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{C.quantity}</dt>
                  <dd className="tabular-nums">{w.quantity}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{C.reason}</dt>
                  <dd>{woOptions.find((o) => o.value === w.reason)?.label ?? w.reason}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{C.date}</dt>
                  <dd>{day.format(w.writtenOffAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{EXPIRY.disposalRef}</dt>
                  <dd>{w.disposalReference ? `${w.disposalReference}, ${w.disposalOn}` : "—"}</dd>
                </div>
              </dl>
              <p className="text-caption text-muted-foreground">{EXPIRY.disposalNote}</p>
              <span className="flex flex-wrap gap-2 print:hidden">
                <ExpiryPrint
                  kind="register"
                  refId={w.id}
                  label={EXPIRY.registerEntry}
                  section={`wo-${w.id}`}
                />
                {manages && !w.disposalReference ? <DisposalDialog writeOffId={w.id} /> : null}
              </span>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
