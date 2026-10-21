import type { ProposalRow } from "./_components/order-forms";
import type { EmrDb } from "@/lib/emr/db";
import type { Ven } from "@/lib/pharmacy/stores/order";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { STORES_B } from "@/content/pharmacy-stores";
import { SUPPLY_COMMON as C, ORDERS as O, PACK_FIELDS } from "@/content/pharmacy-stores-supply";
import { db } from "@/db";
import { pharmacyCounterparties } from "@/db/schema/pharmacy-stores";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyOrderingLiveFor } from "@/lib/pharmacy/feature";
import { trimToBudget, wholePack } from "@/lib/pharmacy/stores/order";
import { getOrders, getProposal, orderingReadiness } from "@/lib/pharmacy/stores/order-read";
import { quantitiesText } from "@/lib/pharmacy/stores/order-store";
import { columnsFor } from "@/lib/pharmacy/stores/packs";
import { loadLedger } from "@/lib/pharmacy/stores/recall-read";
import {
  CloseLineDialog,
  ConfirmCutDialog,
  OrderPrints,
  PaperDialog,
  ProposalForm,
  SaveOrderButton,
} from "./_components/order-forms";

export const metadata: Metadata = { title: "Orders · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

/**
 * Orders (5.9, 5.10, board 2.4; OQ-1 to OQ-7). Behind `pharmacyOrdering`. The proposal from recorded consumption by
 * the EMHS method, every column's arithmetic in place; the in-charge's own quantity; trimming in VEN order, each cut
 * confirmed; saved orders with what is still owed; the HMIS 085, HMIS 084B and purchase-list prints and the copied
 * quantities. MedSync does not send the order (Law 10): the page says so.
 */
export default async function OrdersPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyOrderingLiveFor(actor.hospitalId)) notFound();
  const owner = db as unknown as EmrDb;
  const now = new Date();
  const [proposal, saved, manages, ready, ledger, c085, c084] = await Promise.all([
    getProposal(actor, now),
    getOrders(actor),
    managesPharmacy(actor.userId, actor.hospitalId),
    orderingReadiness(owner, actor.hospitalId),
    asClinicalReader(actor, (tx) => loadLedger(tx, actor.hospitalId)),
    columnsFor(owner, actor.hospitalId, "hmis_085"),
    columnsFor(owner, actor.hospitalId, "hmis_084b"),
  ]);
  const suppliers = await asClinicalReader(actor, (tx) =>
    tx
      .select({ id: pharmacyCounterparties.id, name: pharmacyCounterparties.name })
      .from(pharmacyCounterparties)
      .where(
        and(
          eq(pharmacyCounterparties.hospitalId, actor.hospitalId),
          eq(pharmacyCounterparties.kind, "supplier"),
          isNull(pharmacyCounterparties.retiredAt),
        ),
      ),
  );
  const product = (id: string) => ledger.products.get(id);
  const rows: ProposalRow[] = proposal.lines.map((l) => ({
    productId: l.productId,
    medicineId: l.medicineId,
    name: l.productName,
    unit: l.issueUnit,
    ven: l.ven ? PACK_FIELDS.ven[l.ven] : O.notClassed,
    consumption: l.consumption,
    daysOut: l.row.inputs.daysOut,
    amc: l.amc,
    onHand: l.row.inputs.stockOnHand,
    max: l.row.maxStock,
    proposedUnits: l.row.proposedUnits,
    proposedPacks: l.row.proposedPacks,
    flags: l.row.flags,
    steps: l.steps,
    formula: l.row.formula,
    notAdded: l.notAdded.map((n) => n.name),
  }));
  const missingWords = proposal.missing
    .map((m) => O.parameterNames[m as keyof typeof O.parameterNames] ?? m)
    .join(", ");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader place={PHARMACY.place} placeInTopBar title={O.title} />
      <CautionNotice tone="neutral" lead={STORES_B.notSent} />

      <section aria-label={O.proposal} className="flex flex-col gap-2 print:hidden">
        <h2 className="text-heading-s">{O.proposal}</h2>
        {proposal.missing.length ? (
          <CautionNotice lead={STORES_B.parameterMissing(missingWords, O.roleSetsIt)} />
        ) : (
          <>
            <p className="text-body-s text-muted-foreground">
              {`${O.cutAt}: ${day.format(proposal.cutAt)}${proposal.parameters ? ` · ${O.parameters(String(proposal.parameters.version))}` : ""}`}
            </p>
            {proposal.lines.some((l) => l.row.notChecked.length) ? (
              <p className="text-body-s text-muted-foreground">{O.notChecked}</p>
            ) : null}
            <ProposalForm rows={rows} suppliers={suppliers} canSave={manages} />
          </>
        )}
      </section>

      <section aria-label={O.saved} className="flex flex-col gap-3">
        <h2 className="text-heading-s print:hidden">{O.saved}</h2>
        {saved.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{O.noneSaved}</p>
        ) : null}
        {saved.map((o) => {
          const lineName = (pid: string) => product(pid)?.name ?? pid;
          const trim =
            o.state === "draft" && o.budget !== null
              ? trimToBudget(
                  o.lines.map((l) => {
                    const inputs = l.inputs as {
                      ven?: Ven | null;
                      unitPrice?: number | null;
                      packSize?: string | null;
                    };
                    return {
                      productId: l.productId,
                      ven: inputs.ven ?? null,
                      units: l.chosenUnits ?? l.proposedUnits ?? 0,
                      unitPrice: inputs.unitPrice ?? null,
                      packSize: wholePack(inputs.packSize ?? null),
                    };
                  }),
                  o.budget,
                  proposal.parameters?.unclassedTrimAs ?? null,
                )
              : null;
          const text = quantitiesText(
            o.lines.map((l) => ({
              name: lineName(l.productId),
              units: l.chosenUnits ?? 0,
              unit: product(l.productId)?.issueUnit ?? "",
            })),
          );
          return (
            <article
              key={o.id}
              data-print-section={`order-${o.id}`}
              className="border-border flex flex-col gap-2 rounded-lg border p-3"
            >
              <h3 className="text-body-s">
                {`${o.kind === "emergency" ? O.emergencyLabel : O.cycleLabel} · ${day.format(o.cutAt)}${o.supplier ? ` · ${o.supplier}` : ""}`}
              </h3>
              <p className="text-body-s">
                {o.status === "open" || o.status === "draft" || o.status === "received" ? (
                  <StatusWord>{O.status[o.status]}</StatusWord>
                ) : (
                  <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                    {O.status[o.status]}
                  </StatusWord>
                )}
              </p>
              <p className="text-caption hidden print:block">{STORES_B.notSent}</p>
              {c085 && c084 ? null : (
                <p className="text-caption hidden print:block">
                  {`${c085 ? "" : STORES_B.columnsUnconfirmed("HMIS 085")} ${c084 ? "" : STORES_B.columnsUnconfirmed("HMIS 084B")}`}
                </p>
              )}
              <table className="text-body-s w-full">
                <thead className="bg-ink-50 text-left">
                  <tr>
                    {[
                      C.product,
                      O.columns.proposed,
                      O.columns.yours,
                      O.ordered,
                      O.received,
                      O.owed,
                      C.status,
                      "",
                    ].map((h, i) => (
                      <th key={i} scope="col" className="px-2 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {o.lines.map((l) => (
                    <tr key={l.id} className="align-top">
                      <th scope="row" className="px-2 py-2 text-left font-normal">
                        {lineName(l.productId)}
                        {l.reason ? (
                          <p className="text-caption text-muted-foreground">{l.reason}</p>
                        ) : null}
                      </th>
                      <td className="px-2 py-2 tabular-nums">{l.proposedUnits ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{l.chosenUnits ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{l.ordered}</td>
                      <td className="px-2 py-2 tabular-nums">{l.received}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {l.owed > 0 ? (
                          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                            {String(l.owed)}
                          </StatusWord>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-2 py-2">{O.status[l.state]}</td>
                      <td className="px-2 py-2 print:hidden">
                        {manages &&
                        o.state === "open" &&
                        (l.state === "open" || l.state === "part_received") ? (
                          <CloseLineDialog orderLineId={l.id} name={lineName(l.productId)} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details className="text-caption">
                <summary className="min-h-11 cursor-pointer">{O.appendix}</summary>
                <ul>
                  {o.lines.map((l) => (
                    <li key={l.id}>{`${lineName(l.productId)}: ${JSON.stringify(l.inputs)}`}</li>
                  ))}
                </ul>
              </details>
              {trim ? (
                "missing" in trim ? (
                  <p className="text-body-s print:hidden">{O.unpriced}</p>
                ) : trim.cuts.length ? (
                  <div className="flex flex-col gap-2 print:hidden">
                    <p className="text-body-s">{`${O.trim}: ${O.total(trim.totalBefore.toFixed(2))} → ${trim.totalAfter.toFixed(2)}`}</p>
                    <p className="text-caption text-muted-foreground">{O.trimNote}</p>
                    <ul className="flex flex-col gap-2">
                      {trim.cuts.map((c) => (
                        <li key={c.productId} className="flex flex-wrap items-center gap-2">
                          <span className="text-body-s">{`${lineName(c.productId)} (${PACK_FIELDS.ven[c.trimmedAs]}): ${O.cut(c.fromUnits, c.toUnits)}`}</span>
                          {manages ? (
                            <ConfirmCutDialog
                              orderId={o.id}
                              productId={c.productId}
                              label={O.cut(c.fromUnits, c.toUnits)}
                              vital={c.needsReason}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              ) : null}
              <span className="flex flex-wrap gap-2 print:hidden">
                {manages && o.state === "draft" ? <SaveOrderButton orderId={o.id} /> : null}
                {o.state !== "draft" ? <OrderPrints orderId={o.id} text={text} /> : null}
                {manages && o.state !== "draft" ? (
                  <PaperDialog
                    orderId={o.id}
                    lines={o.lines.map((l) => ({
                      productId: l.productId,
                      name: lineName(l.productId),
                      proposed: l.proposedUnits ?? 0,
                    }))}
                  />
                ) : null}
              </span>
            </article>
          );
        })}
      </section>

      <section aria-label={O.readiness} className="print:hidden">
        {ready.met ? (
          <p className="text-body-s">{O.readyMet}</p>
        ) : (
          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
            {ready.action === "explain_differences"
              ? O.readyUnexplained(ready.evidence.unexplained)
              : O.readyNot}
          </StatusWord>
        )}
      </section>
    </div>
  );
}
