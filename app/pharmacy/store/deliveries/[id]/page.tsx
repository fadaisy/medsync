import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LockIcon,
  PencilIcon,
  ScanLineIcon,
  SearchIcon,
  TagIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { expiryText } from "@/content/pharmacy-stock";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
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
import { cn } from "@/lib/utils";
import {
  AbandonDialog,
  DeliveryPrints,
  FinishDelivery,
  LineDialog,
  RemoveLine,
  ShortDatedChoice,
} from "../_components/delivery-dialogs";
import { DeliveryScan } from "../_components/delivery-scan";
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
 * One delivery, counted against its note (Pharmacy Phase 2, 5.2; RG-1 to RG-6), laid out as the catalogue canvas's
 * board 1 "Count a delivery": on the left the scan band and each line, newest first, with its results in words
 * (amber with an icon for everything but Matches); on the right the delivery, its one action (add to stock, one
 * transaction; a controlled line with its witness), what the order still owes, and what happens next. Closed, it prints the discrepancy report (HMIS 087,
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

  const N = STOCK_UP_POLISH.next;
  const card = "bg-card shadow-tide-card rounded-tide-card overflow-hidden";
  const cardHead = "flex flex-wrap items-center gap-2.5 px-4 pt-3.5 pb-2";
  const newest = nextLineNo - 1;
  const typed = v.lines.filter((l) => l.identitySource === null || l.identitySource === "typed");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5 print:hidden">
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

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Board 1, left: the scan band, then each line counted, newest first. */}
          <section aria-labelledby="d-lines" className={card}>
            <div className={cardHead}>
              <h2 id="d-lines" className="text-heading-m text-foreground">
                {D.lines}
              </h2>
              <span className="text-body-s text-muted-foreground tabular-nums">
                {v.lines.length}
              </span>
            </div>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {open && v.catalogue.live ? <DeliveryScan deliveryId={d.id} /> : null}
              {v.lookaheadDays === null ? (
                <p role="status">
                  <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                    {D.noLookahead}
                  </StatusWord>
                </p>
              ) : null}
              {v.lines.length === 0 ? (
                <p className="text-body-s text-muted-foreground">{D.noLines}</p>
              ) : null}
            </div>
            {v.lines.length ? (
              <ol className="flex flex-col">
                {[...v.lines]
                  .sort((a, b) => b.lineNo - a.lineNo)
                  .map((l) => {
                    const source = l.identitySource ?? "typed";
                    const SourceIcon = SOURCE_ICON[source];
                    return (
                      <li
                        key={l.id}
                        className={cn(
                          "border-border flex flex-col gap-2.5 border-t px-4 py-3.5",
                          open && l.lineNo === newest && "bg-tide-lagoon-tint",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-heading-s text-foreground inline-flex items-center gap-2">
                            <span className="bg-tide-navy-900 text-tide-on-band text-caption grid size-6 shrink-0 place-items-center rounded-full font-mono">
                              <span className="sr-only">{STORE.issues.line} </span>
                              {l.lineNo}
                            </span>
                            {l.productName}
                          </h3>
                          {l.noteProductName ? (
                            <span className="text-body-s text-muted-foreground">
                              {R.noteSaid(l.productName, l.noteProductName)}
                            </span>
                          ) : null}
                          <span className="flex-1" />
                          {v.catalogue.live ? (
                            <span className="bg-background text-caption text-ink-700 inline-flex h-6 items-center gap-1 rounded-full px-2 shadow-[inset_0_0_0_1px_var(--color-border)]">
                              <SourceIcon aria-hidden className="size-3" />
                              {CATALOGUE.source[source]}
                            </span>
                          ) : null}
                          {open ? (
                            <span className="flex flex-wrap gap-2">
                              <LineDialog
                                deliveryId={d.id}
                                lineNo={l.lineNo}
                                line={l}
                                products={v.products}
                                orderLines={v.orderLines}
                                facts={v.catalogue.facts}
                              />
                              <RemoveLine deliveryId={d.id} line={l} />
                            </span>
                          ) : null}
                        </div>
                        <dl
                          className={cn(
                            "rounded-tide-row grid grid-cols-2 gap-x-4 gap-y-2.5 px-3 py-2.5 sm:grid-cols-3 xl:grid-cols-6",
                            open && l.lineNo === newest ? "bg-card" : "bg-background",
                          )}
                        >
                          {l.packs !== null && l.packContents !== null ? (
                            <Kv label={CATALOGUE.receive.packs}>
                              {l.packs} × {l.packContents}
                            </Kv>
                          ) : null}
                          <Kv label={D.batch} mono>
                            {l.batchNumber ?? "—"}
                          </Kv>
                          <Kv label={R.columns.expiry}>{exp(l)}</Kv>
                          <Kv label={D.noteQty}>{l.noteQuantity ?? "—"}</Kv>
                          <Kv label={D.accepted}>{STORE.amounts(l.accepted, l.issueUnit)}</Kv>
                          <Kv label={R.columns.rejected}>
                            {l.rejectedKept + l.rejectedReturned}
                            {l.rejectReason ? (
                              <span className="text-caption text-muted-foreground block font-normal">
                                {REJECT_REASONS[l.rejectReason as keyof typeof REJECT_REASONS]}
                              </span>
                            ) : null}
                          </Kv>
                          {l.unitCost ? <Kv label={R.columns.cost}>{l.unitCost}</Kv> : null}
                        </dl>
                        <div className="text-body-s text-ink-700 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                          {l.packs !== null && l.packContents !== null ? (
                            <span>
                              {CATALOGUE.packsToUnits(
                                l.accepted.toLocaleString("en-GB"),
                                l.issueUnit,
                                l.packs.toLocaleString("en-GB"),
                                l.packContents.toLocaleString("en-GB"),
                              )}
                            </span>
                          ) : null}
                          {l.controlled ? <span>{D.controlled}</span> : null}
                          {l.registrationReason ? (
                            <span>
                              {CATALOGUE.receive.registration.reasons[
                                l.registrationReason as keyof typeof CATALOGUE.receive.registration.reasons
                              ] ?? l.registrationReason}
                            </span>
                          ) : null}
                          <span className="flex-1" />
                          <span className="flex flex-col items-start gap-2 sm:items-end">
                            <span className="sr-only">{D.result}</span>
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
                        </div>
                      </li>
                    );
                  })}
              </ol>
            ) : null}
            {open ? (
              <div className="border-border flex flex-wrap items-center gap-2.5 border-t px-4 py-3">
                <LineDialog
                  deliveryId={d.id}
                  lineNo={nextLineNo}
                  products={v.products}
                  orderLines={v.orderLines}
                  facts={v.catalogue.facts}
                />
              </div>
            ) : null}
          </section>

          {/* Board 1, right: the delivery and its one action, what is owed, what happens next. */}
          <div className="flex flex-col gap-5">
            <section aria-labelledby="d-delivery" className={card}>
              <div className={cardHead}>
                <h2 id="d-delivery" className="text-heading-m text-foreground">
                  {D.header}
                </h2>
              </div>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <Kv label={R.supplier}>{v.supplier?.name}</Kv>
                  <Kv label={R.note} mono>
                    {d.noteNumber}
                  </Kv>
                  <Kv label={R.arrived}>{at.format(d.arrivedAt)}</Kv>
                  <Kv label={STORE.deliveries.receivingAt}>{v.location?.name}</Kv>
                  <Kv label={R.deliverer}>{d.delivererName ?? "—"}</Kv>
                  <Kv label={R.vehicle} mono>
                    {d.vehicleRegistration ?? "—"}
                  </Kv>
                </dl>
                {v.catalogue.live && v.lines.length ? (
                  <p className="text-body-s text-ink-700">
                    {CATALOGUE.receive.typed(typed.length, v.lines.length)}
                  </p>
                ) : null}
                {d.state === "received" && d.finishedAt ? (
                  <p className="text-body-s">{D.received(at.format(d.finishedAt))}</p>
                ) : null}
                {d.state === "abandoned" ? (
                  <p className="text-body-s">{D.abandoned(d.abandonReason ?? "")}</p>
                ) : null}
              </div>
              {open ? (
                <div className="border-border flex flex-col gap-3 border-t px-4 py-3.5">
                  <h3 className="text-heading-s text-foreground">{D.finish}</h3>
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
                  <span>
                    <AbandonDialog deliveryId={d.id} />
                  </span>
                </div>
              ) : null}
              {d.state === "received" && canStore ? (
                <div className="border-border border-t px-4 py-3.5">
                  <DeliveryPrints deliveryId={d.id} />
                </div>
              ) : null}
            </section>

            {d.orderId ? (
              <section aria-labelledby="d-owed" className={card}>
                <div className={cardHead}>
                  <h2 id="d-owed" className="text-heading-m text-foreground">
                    {D.owed}
                  </h2>
                </div>
                <div className="px-4 pb-4">
                  {v.owed.length === 0 ? (
                    <p className="text-body-s text-muted-foreground">{D.nothingOwed}</p>
                  ) : (
                    <ul className="text-body-s flex flex-col gap-1">
                      {v.owed.map((o) => (
                        <li key={o.orderLineId}>
                          <StatusWord tone="caution">
                            {D.owedLine(o.productName, o.owed)}
                          </StatusWord>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}

            {open ? (
              <section aria-labelledby="d-next" className={card}>
                <div className={cardHead}>
                  <h2 id="d-next" className="text-heading-m text-foreground">
                    {N.title}
                  </h2>
                </div>
                <ul className="divide-border flex flex-col divide-y px-2 pb-2">
                  <Told icon={LockIcon} title={N.nothingMoves}>
                    {STORES_B.onlyCounted}
                  </Told>
                  {v.catalogue.live ? (
                    <Told icon={TagIcon} title={N.newPacks}>
                      {CATALOGUE.noGuessing}
                    </Told>
                  ) : null}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {d.state === "received" ? (
        <>
          <section data-print-section="report" className="hidden flex-col gap-3 print:flex">
            <h2 className="text-heading-m">{R.title}</h2>
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
            <h2 className="text-heading-m">{R.grnTitle}</h2>
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

const SOURCE_ICON = { scan: ScanLineIcon, catalogue: SearchIcon, typed: PencilIcon } as const;

/** A label over its value (board 1's key-value pair). */
function Kv({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd
        className={cn("text-body-s text-foreground font-semibold break-words", mono && "font-mono")}
      >
        {children}
      </dd>
    </div>
  );
}

/** One "what happens next" item: an icon, the point, and the signed sentence behind it. */
function Told({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 px-2 py-2.5">
      <span
        aria-hidden
        className="bg-background text-foreground row-span-2 grid size-8 place-items-center rounded-[10px]"
      >
        <Icon className="size-4" />
      </span>
      <span className="text-body-s text-foreground font-semibold">{title}</span>
      <span className="text-caption text-ink-700">{children}</span>
    </li>
  );
}
