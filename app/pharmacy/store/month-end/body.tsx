import type { EmrDb } from "@/lib/emr/db";
import type { Scope } from "@/lib/pharmacy/stores/month-end-read";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { STORES_B } from "@/content/pharmacy-stores";
import { SUPPLY_COMMON as C, MONTH_END as M } from "@/content/pharmacy-stores-supply";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { controlledMedicineIds } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyMonthEndLiveFor } from "@/lib/pharmacy/feature";
import { localMonth } from "@/lib/pharmacy/stores/ledger";
import { COLUMNS } from "@/lib/pharmacy/stores/month-end";
import {
  getMonthReport,
  getStockStatus,
  getTracerAudit,
  monthEndReadiness,
} from "@/lib/pharmacy/stores/month-end-read";
import { columnsFor, peopleAt, reasonList, signedPack } from "@/lib/pharmacy/stores/packs";
import { balancesOf } from "@/lib/pharmacy/stores/recall-read";
import { drugById } from "@/lib/prescribing/formulary";
import {
  CloseMonthDialog,
  ExplainDialog,
  MonthCountDialog,
  MonthPrint,
} from "./_components/month-dialogs";

const monthName = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${m}T00:00:00Z`),
  );
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});
const prevMonth = (m: string) => {
  const d = new Date(`${m}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Month end (5.8, board 2.5; MR-1 to MR-6). Behind `pharmacyMonthEnd`. One place (or the hospital) and one month:
 * the 14 columns from the ledger, the blind month-end count, the products not counted, each difference's reason or
 * Unexplained (carried), money from recorded cost only, the close with a second approver; then HMIS 105 Section 6
 * and the quarterly tracer audit. An open month prints with "Month not closed. Figures may change." Print CSS only.
 */
export async function MonthEndBody({
  searchParams,
}: {
  searchParams: Promise<{ place?: string; month?: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyMonthEndLiveFor(actor.hospitalId)) notFound();
  const sp = await searchParams;
  const thisMonth = localMonth(new Date());
  const months = Array.from({ length: 13 }, (_, i) => i).reduce<string[]>(
    (a, i) => [...a, i === 0 ? thisMonth : prevMonth(a[i - 1]!)],
    [],
  );
  const month = sp.month && months.includes(sp.month) ? sp.month : prevMonth(thisMonth);
  const scope: Scope =
    sp.place && /^[0-9a-f-]{36}$/.test(sp.place)
      ? { kind: "location", locationId: sp.place }
      : { kind: "hospital" };
  const owner = db as unknown as EmrDb;
  const quarterStart = `${month.slice(0, 5)}${String(Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const [report, manages, people, reasons, rules, status, audit, ready, controlled, cols105] =
    await Promise.all([
      getMonthReport(actor, scope, month),
      managesPharmacy(actor.userId, actor.hospitalId),
      peopleAt(owner, actor.hospitalId),
      reasonList(owner, actor.hospitalId, "month_end_differences"),
      signedPack(owner, actor.hospitalId, "month_end_rules"),
      getStockStatus(actor, month),
      getTracerAudit(actor, quarterStart),
      // Counts and live states only, no PHI: read as the owner so dispensing points' live state is seen.
      monthEndReadiness(owner, actor.hospitalId, new Date()),
      controlledMedicineIds(owner, actor.hospitalId),
      columnsFor(owner, actor.hospitalId, "hmis_105_s6"),
    ]);
  const { ledger } = report;
  const canStock = actor.access.permissions.has("pharmacy.stock");
  const place = scope.kind === "location" ? ledger.locations.get(scope.locationId) : null;
  if (scope.kind === "location" && !place) notFound();
  const where = place?.name ?? M.hospital;
  const name = (p: string) => ledger.products.get(p)?.name ?? p;
  const medName = (m: string) => drugById(m)?.generic ?? m;
  const others = people.filter((p) => p.userId !== actor.userId);
  const balances = balancesOf(ledger.movements);
  const countable = place && ["store", "dispensing_point", "quarantine"].includes(place.kind);
  const countBatches = countable
    ? ledger.batches
        .filter((b) => b.pointId === place.id && (balances.get(b.id) ?? 0) !== 0)
        .map((b) => ({
          id: b.id,
          label: `${name(b.productId)} · ${b.batchNumber}`,
          medicineId: b.medicineId,
        }))
    : [];
  const anyControlled = countBatches.some(
    (b) => controlled.has(b.medicineId) || !!drugById(b.medicineId)?.flags.controlled,
  );
  const open = report.closed === null;
  const money = report.rows.some((r) => r.money);
  const cell = "px-2 py-2";
  const n = (v: number | null) => (v === null ? "—" : String(v));
  const select = "border-input bg-card text-body-s min-h-11 rounded-md border px-2.5";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${M.title} · ${where} · ${monthName(month)}`}
      />
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        {/* Workspace v2: the filter keeps its place's tab; the old route ignores it. */}
        <input type="hidden" name="tab" value="monthEnd" />
        <label className="text-body-s flex flex-col gap-1">
          {M.scope}
          <select
            name="place"
            defaultValue={scope.kind === "location" ? scope.locationId : ""}
            className={select}
          >
            <option value="">{M.hospital}</option>
            {[...ledger.locations.values()].map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-body-s flex flex-col gap-1">
          {M.month}
          <select name="month" defaultValue={month} className={select}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="border-input text-body-s min-h-11 rounded-md border px-3">
          {M.show}
        </button>
      </form>

      {open ? (
        <p role="status">
          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
            {STORES_B.monthNotClosed}
          </StatusWord>
        </p>
      ) : (
        <p className="text-body-s">{M.closed(day.format(report.closed!.closedAt))}</p>
      )}
      {open && !rules ? <CautionNotice lead={M.noWindow} /> : null}

      <div className="flex flex-wrap gap-2 print:hidden">
        {open && canStock && countable && countBatches.length ? (
          <MonthCountDialog
            locationId={place.id}
            where={where}
            batches={countBatches}
            controlled={anyControlled}
            people={others}
          />
        ) : null}
        {open && manages && rules ? (
          <CloseMonthDialog
            locationId={place?.id ?? null}
            month={month}
            label={`${where}, ${monthName(month)}`}
            people={others}
          />
        ) : null}
      </div>
      {!countable && place ? (
        <p className="text-body-s text-muted-foreground">{M.countWhere}</p>
      ) : null}

      <section
        aria-label={M.title}
        tabIndex={0}
        className="border-border overflow-x-auto rounded-lg border"
      >
        <table className="text-caption w-full">
          <thead className="bg-ink-50 text-left">
            <tr>
              <th scope="col" className={cell}>
                {M.columns.product}
              </th>
              <th scope="col" className={`${cell} text-right`}>
                {M.columns.opening}
              </th>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className={`${cell} text-right`}>
                  {M.columns[c]}
                </th>
              ))}
              {(["shouldBe", "counted", "difference", "explained"] as const).map((c) => (
                <th key={c} scope="col" className={`${cell} text-right`}>
                  {M.columns[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {report.rows.map((r) => {
              const explained =
                r.explanation === "unexplained"
                  ? M.unexplained
                  : r.explanation === "reason"
                    ? C.reason
                    : "";
              const sentence = M.rowSentence(
                name(r.productId),
                r.shouldBe,
                r.counted,
                r.difference,
                explained || M.unexplained,
              );
              const notCounted = r.hadMovement && r.counted === null;
              return (
                <tr key={r.productId} aria-label={sentence} className="align-top">
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    {name(r.productId)}
                    {r.carried.map((c) => (
                      <p key={c.month} className="text-muted-foreground">
                        {M.carried(monthName(c.month), c.difference)}
                      </p>
                    ))}
                    {r.late.map((l) => (
                      <p key={l.movementId} className="text-muted-foreground">
                        {STORES_B.belongsTo(
                          monthName(l.belongsTo),
                          day.format(new Date(l.recordedAt)),
                        )}
                      </p>
                    ))}
                    {r.adjustedReasons.length ? (
                      <p className="text-muted-foreground">
                        {r.adjustedReasons
                          .map((a) => `${a.reasonCode ?? "—"} ${a.quantity}`)
                          .join(", ")}
                      </p>
                    ) : null}
                    {money ? (
                      <p className="text-muted-foreground">
                        {r.money
                          ? `${M.money}: ${COLUMNS.map((c) => r.money![c].toFixed(2)).join(" / ")}`
                          : STORES_B.noCost}
                      </p>
                    ) : null}
                  </th>
                  <td className={`${cell} text-right tabular-nums`}>{r.opening}</td>
                  {COLUMNS.map((c) => (
                    <td key={c} className={`${cell} text-right tabular-nums`}>
                      {r.columns[c]}
                    </td>
                  ))}
                  <td className={`${cell} text-right tabular-nums`}>{r.shouldBe}</td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {notCounted ? (
                      <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                        {M.notCounted}
                      </StatusWord>
                    ) : (
                      n(r.counted)
                    )}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {r.difference ? (
                      <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                        {String(r.difference)}
                      </StatusWord>
                    ) : (
                      n(r.difference)
                    )}
                  </td>
                  <td className={`${cell} text-right`}>
                    {explained || "—"}
                    {open && canStock && place && (r.difference || notCounted) && !r.explanation ? (
                      <span className="print:hidden">
                        <ExplainDialog
                          locationId={place.id}
                          month={month}
                          productId={r.productId}
                          name={name(r.productId)}
                          kind={notCounted ? "not_counted" : "difference"}
                          reasons={reasons ?? []}
                        />
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {money ? <p className="text-caption text-muted-foreground">{M.moneyNote}</p> : null}

      <section
        data-print-section="stock-status"
        aria-label={M.stockStatus}
        className="flex flex-col gap-2"
      >
        <h2 className="text-heading-s">{M.stockStatus}</h2>
        {open ? <p className="text-caption">{STORES_B.monthNotClosed}</p> : null}
        {status.missing.includes("tracer_list") ? (
          <CautionNotice lead={M.noTracer} />
        ) : (
          <>
            {status.missing.includes("stockout_day_rule") ? (
              <CautionNotice lead={M.noDayRule} />
            ) : null}
            {cols105 ? null : (
              <p className="text-caption">{STORES_B.columnsUnconfirmed("HMIS 105 form")}</p>
            )}
            <table className="text-body-s border-border w-full rounded-lg border">
              <thead className="bg-ink-50 text-left">
                <tr>
                  <th scope="col" className={cell}>
                    {C.product}
                  </th>
                  <th scope="col" className={`${cell} text-right`}>
                    {M.onHand}
                  </th>
                  <th scope="col" className={`${cell} text-right`}>
                    {M.daysOut}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {status.rows.map((r) => (
                  <tr key={r.medicineId}>
                    <th scope="row" className={`${cell} text-left font-normal`}>
                      {medName(r.medicineId)}
                    </th>
                    <td className={`${cell} text-right tabular-nums`}>{r.onHand}</td>
                    <td className={`${cell} text-right tabular-nums`}>{n(r.daysOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <MonthPrint
              kind="stock_status"
              label={`${C.print}: ${M.stockStatus}`}
              section="stock-status"
            />
          </>
        )}
      </section>

      <section
        data-print-section="tracer-audit"
        aria-label={M.tracerAudit}
        className="flex flex-col gap-2"
      >
        <h2 className="text-heading-s">{`${M.tracerAudit} · ${M.quarter} ${monthName(quarterStart)}`}</h2>
        {audit.open ? <p className="text-caption">{STORES_B.monthNotClosed}</p> : null}
        {audit.missing ? (
          <CautionNotice lead={M.noTracer} />
        ) : (
          <>
            <table className="text-body-s border-border w-full rounded-lg border">
              <thead className="bg-ink-50 text-left">
                <tr>
                  {[
                    C.product,
                    M.columns.received,
                    M.columns.issuedOut,
                    M.columns.supplied,
                    M.columns.adjusted,
                    M.columns.writtenOff,
                    M.columns.counted,
                    M.columns.difference,
                  ].map((h) => (
                    <th key={h} scope="col" className={cell}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {audit.rows.map((r) => (
                  <tr key={r.medicineId}>
                    <th scope="row" className={`${cell} text-left font-normal`}>
                      {medName(r.medicineId)}
                    </th>
                    {[
                      r.received,
                      r.issued,
                      r.supplied,
                      r.adjusted,
                      r.writtenOff,
                      r.counted,
                      r.difference,
                    ].map((v, i) => (
                      <td key={i} className={`${cell} tabular-nums`}>
                        {n(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <MonthPrint
              kind="tracer_audit"
              label={`${C.print}: ${M.tracerAudit}`}
              section="tracer-audit"
            />
          </>
        )}
      </section>

      <section aria-label={M.readiness} className="flex flex-col gap-1 print:hidden">
        <h2 className="text-heading-s">{M.readiness}</h2>
        {ready.met ? (
          <p className="text-body-s">{M.readyMet(monthName(ready.evidence.month!))}</p>
        ) : (
          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
            {M.readyNot}
          </StatusWord>
        )}
      </section>
    </div>
  );
}
