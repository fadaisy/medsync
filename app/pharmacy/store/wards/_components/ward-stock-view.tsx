import type { Act, Person } from "./ward-dialogs";
import type { WardStockPage } from "@/lib/pharmacy/stores/ward-read";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { STORES_B, SUPPLY_MODEL, WARDS } from "@/content/pharmacy-stores-wards";
import { countItems, when } from "../_lib/view";
import {
  PackDialog,
  ReceiptDialog,
  RequisitionDialog,
  ReturnDialog,
  SignDialog,
  SupplyDialog,
  TARGET,
  WardCount,
} from "./ward-dialogs";

/**
 * The ward stock page body (5.4), shared by the pharmacy page and the nurse page. No "on the ward now"
 * figure: the holding is known only when counted (Law 4). Doses charted are context, never subtracted
 * (WS-2). In count mode the screen shows only the blind count (Law 5, S20b). Amber carries an icon and a
 * word; nothing is red or green (Law 13).
 */
export interface WardActions {
  count?: Act;
  requisition?: Act;
  returnStock?: Act;
  attestOwn?: Act;
  confirm?: Act;
  supply?: Act;
  levels?: Act;
  attestSigner?: Act;
  sign?: Act;
}

export function WardStockView({
  page,
  base,
  mode,
  me,
  actions,
  products = [],
  signers = [],
}: {
  page: WardStockPage;
  base: string;
  mode: "page" | "count";
  me: string;
  actions: WardActions;
  products?: { id: string; name: string; issueUnit: string }[];
  signers?: Person[];
}) {
  const { location: l } = page;
  const T = WARDS.table;
  if (mode === "count" && actions.count)
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={base}
          className={`text-body-s text-primary inline-flex ${TARGET} items-center underline-offset-4 hover:underline`}
        >
          {WARDS.count.back}
        </Link>
        <WardCount
          locationId={l.id}
          ward={l.name}
          items={countItems(page.products)}
          allocationSigned={page.allocationSigned}
          action={actions.count}
        />
      </div>
    );

  const levelsSigned = page.packs.signed;
  const draft = page.packs.draft;
  const levelValues = Object.fromEntries(
    Object.entries(((draft ?? levelsSigned)?.content.levels ?? {}) as Record<string, number>),
  );
  const freshness = page.freshnessDays === null ? "" : `${page.freshnessDays} days`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {actions.count && l.supplyModel === "stocked" ? (
          <Link
            href={`${base}${base.includes("?") ? "&" : "?"}count=1`}
            className={`bg-primary text-primary-foreground text-body-s inline-flex ${TARGET} items-center rounded-md px-4`}
          >
            {WARDS.count.open}
          </Link>
        ) : null}
        {actions.requisition ? (
          <RequisitionDialog
            locationId={l.id}
            issuers={page.issuers}
            action={actions.requisition}
            lines={page.rows.map((r) => ({
              productId: r.productId,
              name: r.name,
              issueUnit: r.issueUnit,
              suggested: r.topUp.kind === "top_up" ? r.topUp.quantity : null,
            }))}
          />
        ) : null}
        {actions.returnStock ? (
          <ReturnDialog
            locationId={l.id}
            issuers={page.issuers}
            action={actions.returnStock}
            batches={page.products.flatMap((p) =>
              p.controlled
                ? []
                : p.batches.map((b) => ({
                    id: b.id,
                    label: `${p.name} · ${b.batchNumber} · ${b.expiryText}`,
                  })),
            )}
          />
        ) : null}
        {actions.supply ? (
          <SupplyDialog
            locationId={l.id}
            model={l.supplyModel}
            anyNurse={l.anyNurseConfirms}
            action={actions.supply}
          />
        ) : null}
        {actions.levels ? (
          <PackDialog
            kind="ward_levels"
            locationId={l.id}
            products={products}
            values={levelValues}
            action={actions.levels}
          />
        ) : null}
        {actions.sign && actions.attestSigner && draft ? (
          <SignDialog
            packId={draft.id}
            locationId={l.id}
            me={me}
            people={signers}
            secondTitle={WARDS.sign.second}
            attest={actions.attestSigner}
            sign={actions.sign}
          />
        ) : null}
      </div>

      <p className="text-body-s text-muted-foreground">
        {l.supplyModel ? SUPPLY_MODEL[l.supplyModel] : WARDS.modeUnset}
        {" · "}
        {l.anyNurseConfirms ? WARDS.anyNurse : WARDS.inChargeOnly}
        {" · "}
        {levelsSigned
          ? WARDS.levels.signed(levelsSigned.version, when(levelsSigned.signedAt ?? new Date()))
          : WARDS.levels.unsigned}
        {draft ? ` ${WARDS.levels.draft(draft.version)}` : ""}
      </p>

      {page.notices.length ? (
        <CautionNotice lead={WARDS.notices.title}>
          <ul className="flex flex-col gap-1">
            {page.notices.map((n) => (
              <li key={n.id}>{WARDS.notices.line(n.product, n.batchNumber)}</li>
            ))}
          </ul>
          {page.batchesMixed ? <p className="mt-1">{STORES_B.batchesMixed}</p> : null}
        </CautionNotice>
      ) : null}

      <section aria-labelledby="ward-receipts" className="flex flex-col gap-2">
        <h2 id="ward-receipts" className="text-heading-s text-foreground">
          {WARDS.receipts.title}
        </h2>
        {page.receipts.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{WARDS.receipts.none}</p>
        ) : (
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {page.receipts.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-body-s flex flex-col gap-0.5">
                  <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                    {STORES_B.issuedUnconfirmed(when(i.issuedAt), l.name)}
                  </StatusWord>
                  <span className="text-muted-foreground">
                    {i.fromName}:{" "}
                    {i.lines
                      .map((x) => `${x.productName} ${x.quantity} (${x.batchNumber})`)
                      .join(", ")}
                  </span>
                </span>
                {actions.confirm && actions.attestOwn ? (
                  <ReceiptDialog
                    locationId={l.id}
                    issue={i}
                    me={me}
                    attest={actions.attestOwn}
                    confirm={actions.confirm}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {page.surplus.length ? (
        <section aria-labelledby="ward-surplus" className="flex flex-col gap-2">
          <h2 id="ward-surplus" className="text-heading-s text-foreground">
            {WARDS.surplus}
          </h2>
          <ul className="text-body-s flex flex-col gap-1">
            {page.surplus.map((s) => (
              <li key={`${s.countId}-${s.batchId}`}>
                <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                  {`${s.product}, batch ${s.batchNumber}, ${when(s.at)}: counted ${s.counted}, ${s.recorded} issued and not used. ${STORES_B.moreThanIssued}`}
                </StatusWord>
                {s.reasoned ? null : (
                  <span className="text-muted-foreground"> {WARDS.count.pending}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="text-body-s w-full min-w-[720px] border-collapse">
          <caption className="sr-only">{T.caption}</caption>
          <thead className="bg-muted text-left">
            <tr>
              {[
                T.product,
                T.level,
                T.last,
                T.issued,
                T.returned,
                T.doses,
                T.topUp,
                T.requisition,
              ].map((h) => (
                <th key={h} scope="col" className="text-label px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {page.rows.map((r) => (
              <tr key={r.productId}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {r.name}
                  <span className="text-muted-foreground"> ({r.issueUnit})</span>
                </th>
                <td className="px-3 py-2 tabular-nums">{r.wardLevel ?? T.noLevel}</td>
                <td className="px-3 py-2">
                  {r.lastCount
                    ? T.counted(r.lastCount.counted, when(r.lastCount.at), r.lastCount.by)
                    : T.notCounted}
                  {r.allocated ? (
                    <span className="text-muted-foreground"> ({T.allocated})</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.issuedSince}</td>
                <td className="px-3 py-2 tabular-nums">{r.returnedSince}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.dosesCharted}
                  <span className="sr-only">. {STORES_B.dosesContext(r.dosesCharted)}</span>
                </td>
                <td className="px-3 py-2">
                  {r.topUp.kind === "top_up" ? (
                    <span className="tabular-nums">{r.topUp.quantity}</span>
                  ) : r.topUp.kind === "count_first" ? (
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {STORES_B.countFirst(freshness)}
                    </StatusWord>
                  ) : (
                    <span className="text-muted-foreground">
                      {r.topUp.missing.map((m) => WARDS.missing[m]).join(" ")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.ask
                    ? T.asked(
                        r.ask.asked,
                        WARDS.requisition.states[
                          r.ask.state as keyof typeof WARDS.requisition.states
                        ] ?? r.ask.state,
                      )
                    : T.none}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-body-s text-muted-foreground">
        {WARDS.notOnWard} {WARDS.controlledPaper}
      </p>
    </div>
  );
}
