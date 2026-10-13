import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";

import { DOWNTIME_PAGE } from "@/content/pharmacy-golive";
import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { downtimeFormNumbers } from "@/db/schema/lab-safety";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { DOWNTIME_COPY, pharmacySheetLabel } from "@/lib/pharmacy/downtime";
import { pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import { PrintButton } from "../../../_components/downtime-dialogs";

export const metadata: Metadata = { title: "Downtime sheets · Pharmacy · MedSync" };
export const dynamic = "force-dynamic";

const S = DOWNTIME_PAGE.sheet;
const SUPPLY_ROWS = 15;
const NOT_SUPPLIED_ROWS = 6;
const CELL = "border border-black px-1 py-0.5";

/**
 * The downtime dispensing sheet (5.12, artboard 1.9, wireframe §12.1): A4 portrait, print CSS only,
 * black on white, legible in greyscale (12 px text, 1 px rules). One reserved number per sheet,
 * printed as DS-00031, with numbered Supplies and Not supplied rows and the entry box. Only this
 * hospital's pharmacy sheets in the run that are still unused print.
 */
export default async function DowntimeSheetsPage({
  params,
}: {
  params: Promise<{ from: string; to: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyDowntimeLiveFor(actor.hospitalId)) notFound();
  const { from, to } = await params;
  const a = Number(from);
  const b = Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b - a >= 200) notFound();
  const database = db as unknown as EmrDb;
  const [rows, [hospital]] = await Promise.all([
    database
      .select({ number: downtimeFormNumbers.number, point: hospitalDepartments.name })
      .from(downtimeFormNumbers)
      .innerJoin(
        hospitalDepartments,
        eq(hospitalDepartments.id, downtimeFormNumbers.dispensingPointId),
      )
      .where(
        and(
          eq(downtimeFormNumbers.hospitalId, actor.hospitalId),
          eq(downtimeFormNumbers.workspace, "pharmacy"),
          eq(downtimeFormNumbers.state, "unused"),
          gte(downtimeFormNumbers.number, a),
          lte(downtimeFormNumbers.number, b),
        ),
      )
      .orderBy(asc(downtimeFormNumbers.number)),
    database
      .select({ name: hospitals.name })
      .from(hospitals)
      .where(eq(hospitals.id, actor.hospitalId)),
  ]);
  const blank = (n: number, cols: number) =>
    Array.from({ length: n }, (_, i) => (
      <tr key={i}>
        <td className={`${CELL} h-7 w-6 text-right tabular-nums`}>{i + 1}</td>
        {Array.from({ length: cols - 1 }, (_, j) => (
          <td key={j} className={CELL} />
        ))}
      </tr>
    ));
  const head = (cols: readonly string[]) => (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c} scope="col" className={`${CELL} text-left font-semibold`}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <style>{"@media print { @page { size: A4 portrait; margin: 8mm; } }"}</style>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <p className="text-body-s">{rows.length ? S.toPrint(rows.length) : S.none}</p>
        {rows.length ? <PrintButton /> : null}
      </div>
      {rows.map((r) => (
        <article
          key={r.number}
          className="flex [break-after:page] flex-col gap-2 bg-white p-[8mm] text-[12px] leading-snug text-black last:[break-after:auto] print:p-0"
        >
          <header className="flex items-start justify-between gap-4 border-b border-black pb-1">
            <div>
              <p className="text-[16px] font-semibold uppercase">{S.heading}</p>
              <p>
                {hospital?.name ?? ""} · {r.point}
              </p>
            </div>
            <p className="font-mono text-[18px] font-semibold">{pharmacySheetLabel(r.number)}</p>
          </header>
          <p className="flex gap-8">
            <span>{S.date} ______________</span>
            <span>{S.started} _____ : _____</span>
          </p>
          <section>
            <p className="font-semibold uppercase">{S.supplies}</p>
            <table className="w-full border-collapse">
              {head(S.supplyColumns)}
              <tbody>{blank(SUPPLY_ROWS, S.supplyColumns.length)}</tbody>
            </table>
          </section>
          <section>
            <p className="font-semibold uppercase">{S.notSupplied}</p>
            <table className="w-full border-collapse">
              {head(S.notSuppliedColumns)}
              <tbody>{blank(NOT_SUPPLIED_ROWS, S.notSuppliedColumns.length)}</tbody>
            </table>
          </section>
          <section className="flex flex-wrap gap-x-8 gap-y-1 border border-black p-2">
            <span className="font-semibold uppercase">{S.entry}</span>
            <span>{S.enteredBy} ______________</span>
            <span>{S.signature} ______________</span>
            <span>{S.dateTime} ______________</span>
          </section>
          <p>{DOWNTIME_COPY.sheetFooter}</p>
        </article>
      ))}
    </div>
  );
}
