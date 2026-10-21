import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { SectionNumber } from "@/components/medsync/section-number";
import { PHARMACY } from "@/content/pharmacy";
import { expiryText } from "@/content/pharmacy-stock";
import {
  REJECT_REASONS,
  resultWords,
  SHORT_DATED_DECISIONS,
  STORE,
  STORES_B,
} from "@/content/pharmacy-stores-store";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { witnessCandidates } from "@/lib/pharmacy/controlled-read";
import { pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { getDelivery } from "@/lib/pharmacy/stores/store-read";
import {
  AbandonDialog,
  DeliveryPrints,
  FinishDelivery,
  LineDialog,
  RemoveLine,
  ShortDatedChoice,
} from "../_components/delivery-dialogs";
import { ResultWords } from "../../places/_components/store-kit";

export const metadata: Metadata = { title: "Delivery · Pharmacy" };
export const dynamic = "force-dynamic";

const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * One delivery, counted against its note (Pharmacy Phase 2, 5.2, board 2.1; RG-1 to RG-6). 1 · the delivery,
 * 2 · its lines with their results in words (amber with an icon for everything but Matches), 3 · add to stock
 * (one transaction; a controlled line with its witness). Closed, it prints the discrepancy report (HMIS 087,
 * columns not confirmed) and the goods received note, with print CSS only, each print logged.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePharmacyActor();
  if (!pharmacyStoreLiveFor(actor.hospitalId)) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [v, witnesses] = await Promise.all([
    getDelivery(actor, id),
    witnessCandidates(db, actor.hospitalId, actor.userId),
  ]);
  if (!v) notFound();
  const d = v.delivery;
  const canStore = actor.access.permissions.has("pharmacy.store");
  const open = d.state === "counting" && canStore;
  const D = STORE.delivery;
  const R = STORE.report;
  const stockLines = v.lines.filter((l) => l.accepted + l.rejectedKept > 0);
  const nextLineNo = Math.max(0, ...v.lines.map((l) => l.lineNo)) + 1;
  const report = v.lines.filter((l) => v.reportLineNos.has(l.lineNo));
  const exp = (l: { expiry: string | null; expiryMonthOnly: boolean }) =>
    l.expiry ? expiryText({ expiry: l.expiry, expiryMonthOnly: l.expiryMonthOnly }) : "—";
  const header = (
    <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">{R.supplier}</dt>
        <dd>{v.supplier?.name}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{R.note}</dt>
        <dd className="font-mono">{d.noteNumber}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{R.arrived}</dt>
        <dd>{at.format(d.arrivedAt)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{STORE.deliveries.receivingAt}</dt>
        <dd>{v.location?.name}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{R.deliverer}</dt>
        <dd>{d.delivererName ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{R.vehicle}</dt>
        <dd>{d.vehicleRegistration ?? "—"}</dd>
      </div>
    </dl>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          place={PHARMACY.place}
          placeInTopBar
          title={D.title(d.noteNumber, v.supplier?.name ?? "")}
          subline={
            <Link
              href="/pharmacy/store/deliveries"
              className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {STORE.deliveries.title}
            </Link>
          }
          right={
            d.state === "counting" ? (
              <StatusWord tone="caution">{STORE.deliveries.states.counting}</StatusWord>
            ) : (
              <StatusWord>{STORE.deliveries.states[d.state]}</StatusWord>
            )
          }
        />

        <section aria-labelledby="d1" className="flex flex-col gap-3">
          <h2 id="d1" className="text-heading-s inline-flex items-center gap-2">
            <SectionNumber n={1} />
            {D.header}
          </h2>
          {header}
          {d.state === "received" && d.finishedAt ? (
            <p className="text-body-s">{D.received(at.format(d.finishedAt))}</p>
          ) : null}
          {d.state === "abandoned" ? (
            <p className="text-body-s">{D.abandoned(d.abandonReason ?? "")}</p>
          ) : null}
        </section>

        <section aria-labelledby="d2" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="d2" className="text-heading-s inline-flex items-center gap-2">
              <SectionNumber n={2} />
              {D.lines}
            </h2>
            {open ? (
              <LineDialog
                deliveryId={d.id}
                lineNo={nextLineNo}
                products={v.products}
                orderLines={v.orderLines}
              />
            ) : null}
          </div>
          <p className="text-body-s text-muted-foreground">{STORES_B.onlyCounted}</p>
          {v.lookaheadDays === null ? (
            <p role="status">
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {D.noLookahead}
              </StatusWord>
            </p>
          ) : null}
          {v.lines.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{D.noLines}</p>
          ) : (
            <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
              <table className="text-body-s w-full">
                <thead className="bg-ink-50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {D.product}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      {D.noteQty}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      {D.accepted}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      {R.columns.rejected}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {D.batch}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {R.columns.expiry}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {D.result}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">{D.editLine}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {v.lines.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="px-3 py-2 tabular-nums">{l.lineNo}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col">
                          <span className="font-medium">{l.productName}</span>
                          {l.noteProductName ? (
                            <span className="text-muted-foreground">{l.noteProductName}</span>
                          ) : null}
                          {l.controlled ? (
                            <span className="text-caption">{D.controlled}</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.noteQuantity ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.accepted}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.rejectedKept + l.rejectedReturned}
                        {l.rejectReason ? (
                          <span className="text-muted-foreground block">
                            {REJECT_REASONS[l.rejectReason as keyof typeof REJECT_REASONS]}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono">{l.batchNumber ?? "—"}</td>
                      <td className="px-3 py-2">{exp(l)}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-2">
                          <ResultWords results={l.results} />
                          {l.needsDecision && open ? (
                            <ShortDatedChoice
                              deliveryId={d.id}
                              lineNo={l.lineNo}
                              current={l.shortDatedDecision}
                            />
                          ) : l.shortDatedDecision ? (
                            <StatusWord>{SHORT_DATED_DECISIONS[l.shortDatedDecision]}</StatusWord>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {open ? (
                          <span className="flex flex-wrap justify-end gap-2">
                            <LineDialog
                              deliveryId={d.id}
                              lineNo={l.lineNo}
                              line={l}
                              products={v.products}
                              orderLines={v.orderLines}
                            />
                            <RemoveLine deliveryId={d.id} line={l} />
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

        {d.orderId ? (
          <section aria-labelledby="owed" className="flex flex-col gap-2">
            <h2 id="owed" className="text-heading-s">
              {D.owed}
            </h2>
            {v.owed.length === 0 ? (
              <p className="text-body-s text-muted-foreground">{D.nothingOwed}</p>
            ) : (
              <ul className="text-body-s flex flex-col gap-1">
                {v.owed.map((o) => (
                  <li key={o.orderLineId}>
                    <StatusWord tone="caution">{D.owedLine(o.productName, o.owed)}</StatusWord>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {open ? (
          <section aria-labelledby="d3" className="flex flex-col gap-3">
            <h2 id="d3" className="text-heading-s inline-flex items-center gap-2">
              <SectionNumber n={3} />
              {D.finish}
            </h2>
            {v.lines.some((l) => l.rejectedKept > 0) ? (
              <p className="text-body-s">
                {v.quarantine ? D.quarantineAt(v.quarantine.name) : D.noQuarantine}
              </p>
            ) : null}
            {v.lines.some((l) => l.controlled) ? (
              <p className="text-body-s">{STORES_B.paperStillApplies}</p>
            ) : null}
            <FinishDelivery
              deliveryId={d.id}
              stockLines={stockLines.length}
              controlledLines={stockLines
                .filter((l) => l.controlled)
                .map((l) => ({
                  lineNo: l.lineNo,
                  label: `${STORE.issues.line} ${l.lineNo} · ${l.productName}`,
                }))}
              witnesses={witnesses}
            />
            <AbandonDialog deliveryId={d.id} />
          </section>
        ) : null}

        {d.state === "received" && canStore ? <DeliveryPrints deliveryId={d.id} /> : null}
      </div>

      {d.state === "received" ? (
        <>
          <section data-print-section="report" className="hidden flex-col gap-3 print:flex">
            <h1 className="text-heading-m">{R.title}</h1>
            <p className="text-body-s">{STORES_B.columnsUnconfirmed("HMIS 087 form")}</p>
            <p className="text-body-s">
              {R.hospital}: {v.hospitalName}
            </p>
            {header}
            {report.length === 0 ? (
              <p className="text-body-s">{R.noDiscrepancy}</p>
            ) : (
              <table className="text-body-s w-full border-collapse">
                <thead>
                  <tr className="border-b text-left">
                    <th scope="col">{R.columns.line}</th>
                    <th scope="col">{R.columns.product}</th>
                    <th scope="col">{R.columns.batch}</th>
                    <th scope="col">{R.columns.expiry}</th>
                    <th scope="col">{R.columns.note}</th>
                    <th scope="col">{R.columns.counted}</th>
                    <th scope="col">{R.columns.accepted}</th>
                    <th scope="col">{R.columns.rejected}</th>
                    <th scope="col">{R.columns.result}</th>
                    <th scope="col">{R.columns.decision}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((l) => (
                    <tr key={l.id} className="border-b align-top">
                      <td>{l.lineNo}</td>
                      <td>
                        {l.noteProductName
                          ? R.noteSaid(l.productName, l.noteProductName)
                          : l.productName}
                      </td>
                      <td>{l.batchNumber ?? "—"}</td>
                      <td>{exp(l)}</td>
                      <td>{l.noteQuantity ?? "—"}</td>
                      <td>{l.accepted + l.rejectedKept + l.rejectedReturned}</td>
                      <td>{l.accepted}</td>
                      <td>{l.rejectedKept + l.rejectedReturned}</td>
                      <td>
                        {l.results
                          .filter((r) => r.kind !== "matches")
                          .map(resultWords)
                          .join("; ")}
                      </td>
                      <td>
                        {l.shortDatedDecision ? SHORT_DATED_DECISIONS[l.shortDatedDecision] : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Signatures />
            <p className="text-caption">{R.neverSent}</p>
          </section>
          <section data-print-section="grn" className="hidden flex-col gap-3 print:flex">
            <h1 className="text-heading-m">{R.grnTitle}</h1>
            <p className="text-body-s">
              {R.hospital}: {v.hospitalName}
            </p>
            {header}
            <table className="text-body-s w-full border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col">{R.columns.line}</th>
                  <th scope="col">{R.columns.product}</th>
                  <th scope="col">{R.columns.batch}</th>
                  <th scope="col">{R.columns.expiry}</th>
                  <th scope="col">{R.columns.accepted}</th>
                  <th scope="col">{R.columns.cost}</th>
                </tr>
              </thead>
              <tbody>
                {v.lines
                  .filter((l) => l.accepted > 0)
                  .map((l) => (
                    <tr key={l.id} className="border-b">
                      <td>{l.lineNo}</td>
                      <td>{l.productName}</td>
                      <td>{l.batchNumber}</td>
                      <td>{exp(l)}</td>
                      <td>{STORE.amounts(l.accepted, l.issueUnit)}</td>
                      <td>{l.unitCost ?? STORES_B.noCost}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {v.lines.some((l) => l.controlled) ? (
              <p className="text-body-s">{STORES_B.paperStillApplies}</p>
            ) : null}
            <Signatures />
          </section>
        </>
      ) : null}
    </div>
  );
}

function Signatures() {
  return (
    <div className="mt-6 grid grid-cols-3 gap-6">
      {STORE.report.signatures.map((s) => (
        <div key={s} className="flex flex-col gap-8">
          <span className="text-body-s">{s}</span>
          <span className="text-caption border-t pt-1">{STORE.report.signature}</span>
        </div>
      ))}
    </div>
  );
}
