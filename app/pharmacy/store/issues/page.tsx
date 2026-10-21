import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { expiryText } from "@/content/pharmacy-stock";
import { REQUISITION_STATE_WORDS, STORE, STORES_B } from "@/content/pharmacy-stores-store";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { witnessCandidates } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { getIssuesPage } from "@/lib/pharmacy/stores/store-read";
import {
  BorrowDialog,
  CloseLoanDialog,
  ConfirmReceiptDialog,
  DirectIssueDialog,
  LendDialog,
  LoanPrint,
  RaiseRequisitionDialog,
  ReturnDialog,
} from "./_components/issue-dialogs";

export const metadata: Metadata = { title: "Issues and requisitions · Pharmacy" };
export const dynamic = "force-dynamic";

const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * Issues and requisitions (Pharmacy Phase 2, 5.3, board 2.2 issue side): requisitions raised to the places the
 * pharmacy issues from, waiting first; issues that reached a pharmacy place and still wait for its confirmation
 * ("Issued {time}, not yet confirmed by {location}", Law 11); returns; and loans to and from other facilities,
 * listed until returned or closed.
 */
export default async function IssuesPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyStoreLiveFor(actor.hospitalId)) notFound();
  const [data, manages, witnesses] = await Promise.all([
    getIssuesPage(actor),
    managesPharmacy(actor.userId, actor.hospitalId),
    witnessCandidates(db, actor.hospitalId, actor.userId),
  ]);
  const p = actor.access.permissions;
  const canStore = p.has("pharmacy.store");
  const canStock = p.has("pharmacy.stock");
  const I = STORE.issues;
  const L = STORE.loans;
  const controlled = new Map(data.products.map((x) => [x.id, x.controlled]));
  const batches = data.batches.map((b) => ({
    id: b.id,
    locationId: b.locationId,
    locationName: b.locationName,
    productId: b.productId,
    productName: b.productName,
    issueUnit: b.issueUnit,
    batchNumber: b.batchNumber,
    expiryText: expiryText(b),
    balance: b.balance,
    controlled: !!controlled.get(b.productId),
  }));
  const places = data.places.map((x) => ({ id: x.id, name: x.name }));
  const waiting = data.requisitions.filter((r) => r.state === "raised");
  const unconfirmed = data.requisitions.filter(
    (r) => r.state === "issued" || r.state === "part_issued",
  );
  const closed = data.requisitions.filter((r) => !waiting.includes(r) && !unconfirmed.includes(r));
  const table = (rows: typeof data.requisitions, caption: string) => (
    <section className="flex flex-col gap-2" aria-label={caption}>
      <h2 className="text-heading-s">{caption}</h2>
      {rows.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{I.empty}</p>
      ) : (
        <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
          <table className="text-body-s w-full">
            <thead className="bg-ink-50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {I.columns.raised}
                </th>
                <th scope="col" className="px-3 py-2">
                  {I.columns.from}
                </th>
                <th scope="col" className="px-3 py-2">
                  {I.columns.to}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {I.columns.lines}
                </th>
                <th scope="col" className="px-3 py-2">
                  {I.columns.state}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/pharmacy/store/issues/${r.id}`}
                      className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {at.format(r.raisedAt)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.fromName}</td>
                  <td className="px-3 py-2">{r.toName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.lines}</td>
                  <td className="px-3 py-2">
                    {r.state === "raised" ? (
                      <StatusWord tone="caution">{REQUISITION_STATE_WORDS.raised}</StatusWord>
                    ) : (r.state === "issued" || r.state === "part_issued") && r.issuedAt ? (
                      <StatusWord tone="caution">
                        {STORES_B.issuedUnconfirmed(at.format(r.issuedAt), r.fromName)}
                      </StatusWord>
                    ) : (
                      <StatusWord>{REQUISITION_STATE_WORDS[r.state]}</StatusWord>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={I.title}
        subline={<span className="text-body-s text-muted-foreground">{I.lead}</span>}
        right={
          <>
            <Link
              href="/pharmacy/store/places"
              className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {STORE.places.title}
            </Link>
            {canStore ? <RaiseRequisitionDialog places={places} products={data.products} /> : null}
            {canStore ? (
              <DirectIssueDialog places={places} products={data.products} witnesses={witnesses} />
            ) : null}
            {canStock ? (
              <ReturnDialog batches={batches} places={places} witnesses={witnesses} />
            ) : null}
          </>
        }
      />

      {data.toConfirm.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="to-confirm">
          <h2 id="to-confirm" className="text-heading-s">
            {I.toConfirm}
          </h2>
          <ul className="border-border divide-border divide-y rounded-lg border">
            {data.toConfirm.map((c) => (
              <li
                key={c.issueId}
                className="text-body-s flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <StatusWord tone="caution">
                  {STORES_B.issuedUnconfirmed(at.format(c.issuedAt), c.to)}
                </StatusWord>
                <span className="text-muted-foreground">{c.from}</span>
                {canStock ? <ConfirmReceiptDialog issue={c} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {table(waiting, I.waiting)}
      {table(unconfirmed, I.unconfirmed)}
      {table(closed.slice(0, 50), I.closed)}

      <section className="flex flex-col gap-2" aria-labelledby="loans">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="loans" className="text-heading-s">
            {L.title}
          </h2>
          {manages ? (
            <span className="flex flex-wrap gap-2">
              <LendDialog batches={batches} facilities={data.facilities} />
              <BorrowDialog places={places} facilities={data.facilities} products={data.products} />
            </span>
          ) : null}
        </div>
        <p className="text-body-s text-muted-foreground">
          {L.lead} {L.controlledNever}
        </p>
        {data.loans.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{L.none}</p>
        ) : (
          <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <thead className="bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    {L.columns.facility}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {L.columns.product}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {L.columns.direction}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    {L.columns.outstanding}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {L.columns.since}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{L.close}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {data.loans.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.facility}</td>
                    <td className="px-3 py-2">
                      {l.productName} <span className="font-mono">{l.batchNumber}</span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusWord tone="caution">{L.directions[l.direction]}</StatusWord>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {STORE.amounts(l.outstanding, l.issueUnit)}
                    </td>
                    <td className="px-3 py-2">{at.format(l.since)}</td>
                    <td className="px-3 py-2">
                      {manages ? (
                        <span className="flex flex-wrap justify-end gap-2">
                          <CloseLoanDialog loan={l} />
                          <LoanPrint loanId={l.id} />
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

      {data.loans.map((l) => (
        <section
          key={l.id}
          data-print-section={`loan-${l.id}`}
          className="hidden flex-col gap-2 print:flex"
        >
          <h1 className="text-heading-m">{L.title}</h1>
          <p className="text-body-s">{STORES_B.columnsUnconfirmed("loan record layout")}</p>
          <dl className="text-body-s grid grid-cols-2 gap-1">
            <dt>{L.columns.facility}</dt>
            <dd>{l.facility}</dd>
            <dt>{L.columns.product}</dt>
            <dd>
              {l.productName} · {l.batchNumber}
            </dd>
            <dt>{L.columns.direction}</dt>
            <dd>{L.directions[l.direction]}</dd>
            <dt>{L.columns.outstanding}</dt>
            <dd>{STORE.amounts(l.outstanding, l.issueUnit)}</dd>
            <dt>{L.columns.since}</dt>
            <dd>{at.format(l.since)}</dd>
          </dl>
          <div className="mt-6 grid grid-cols-2 gap-6">
            {STORE.report.signatures.slice(0, 2).map((s) => (
              <div key={s} className="flex flex-col gap-8">
                <span className="text-body-s">{s}</span>
                <span className="text-caption border-t pt-1">{STORE.report.signature}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
