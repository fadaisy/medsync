import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LOG_PAGE as L } from "@/content/pharmacy-golive";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { DEFAULT_LOG_COLUMNS } from "@/lib/pharmacy/print/dispensing-log";
import { getDispensingLog, logColumnMap } from "@/lib/pharmacy/print/log-read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { ConfirmColumnsDialog, PrintLog } from "./_components/log-controls";

export const metadata: Metadata = { title: "Daily dispensing log · Pharmacy · MedSync" };
export const dynamic = "force-dynamic";

const CELL = "border border-black px-1 py-0.5 align-top";
const dayWords = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${day}T12:00:00Z`),
  );

/**
 * The Daily Dispensing Log (5.12, DL-1 to DL-3, wireframe §12.3): the day's supplies at the acting
 * point, one row per batch, in the hospital's confirmed column order, or MedSync's with the "not yet
 * confirmed" line. Back-entered rows on the day supplied, marked; reversed and in-error rows struck
 * through with the reason. A4 landscape, print CSS only, black on white. Behind `pharmacyDispensing`.
 */
export default async function DispensingLogPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const scope = await requirePharmacyScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const actor = await requirePharmacyActor();
  const point = actor.points.find((p) => p.id === actor.pointId);
  if (!point) notFound();
  const today = localDate(new Date());
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  const [log, map, manages] = await Promise.all([
    getDispensingLog(scope.hospitalId, point.id, day, async (ids) => {
      const found = await identitiesFor(scope, ids, "pharmacy_dispensing_log");
      return new Map([...found].map(([id, p]) => [id, { name: p.name, mrn: p.mrn }]));
    }),
    logColumnMap(scope.hospitalId, db as unknown as EmrDb),
    managesPharmacy(scope.userId, scope.hospitalId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[297mm] flex-col gap-3 px-4 py-6 print:max-w-none print:p-0">
      <style>{"@media print { @page { size: A4 landscape; margin: 8mm; } }"}</style>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <p className="text-body-s">{L.rows(log.rows.length)}</p>
        <PrintLog day={day} />
        {manages ? <ConfirmColumnsDialog initial={map?.columns ?? DEFAULT_LOG_COLUMNS} /> : null}
      </div>
      <article className="flex flex-col gap-2 bg-white p-[8mm] text-[12px] leading-snug text-black print:p-0">
        <header className="border-b border-black pb-1">
          <p className="text-[16px] font-semibold uppercase">
            {L.heading} · {scope.hospitalName} · {point.name} · {dayWords(day)}
          </p>
          {log.notice ? <p>{log.notice}</p> : null}
        </header>
        {log.rows.length === 0 ? (
          <p>{L.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${CELL} text-left font-semibold`}>
                  #
                </th>
                {log.headings.map((h, i) => (
                  <th key={i} scope="col" className={`${CELL} text-left font-semibold`}>
                    {h}
                  </th>
                ))}
                <th scope="col" className={`${CELL} text-left font-semibold`}>
                  {L.note}
                </th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((r, i) => (
                <tr key={r.supplyId}>
                  <td className={`${CELL} tabular-nums`}>{i + 1}</td>
                  {r.cells.map((c, j) => (
                    <td key={j} className={`${CELL} ${r.struck ? "line-through" : ""}`}>
                      {c}
                    </td>
                  ))}
                  <td className={CELL}>{r.notes.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  );
}
