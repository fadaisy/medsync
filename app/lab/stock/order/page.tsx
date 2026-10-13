import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labStockLiveFor } from "@/lib/lab/feature";
import { loadStock } from "@/lib/lab/stock-read";
import { dateWords, timeWords } from "../../_lib/days";
import { PrintButton } from "../../downtime/print/print-button";

export const metadata: Metadata = { title: "Order request · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Print order request (Lab Phase 3 §5.5): a request for the store, one item or every item below its minimum,
 * with the quantity to reach the maximum (ST-5). Black on white; no supplier ordering integration.
 */
export default async function OrderRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId) || !labStockLiveFor(scope.hospitalId))
    notFound();
  const { item } = await searchParams;
  const now = new Date();
  const stock = await db.transaction((tx) => loadStock(tx as never, scope.hospitalId, now));
  const rows = stock.items.filter((i) => (item ? i.id === item : i.belowMinimum || i.onHand <= 0));
  const cell = "border border-black px-2 py-1";
  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 bg-white p-[10mm] text-[12px] text-black print:p-0">
      <div className="flex items-center gap-3 print:hidden">
        <PrintButton />
      </div>
      <header className="border-b-2 border-black pb-2">
        <p className="text-[16px] font-medium">Laboratory order request</p>
        <p>
          {scope.hospitalName} · {dateWords(now)} {timeWords(now)}
        </p>
      </header>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {["Item", "Unit", "On hand", "Months of stock", "To reach maximum"].map((h) => (
              <th key={h} scope="col" className={`${cell} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td className={cell}>{i.name}</td>
              <td className={cell}>
                {i.packSize ? `${i.unitOfIssue} of ${i.packSize}` : i.unitOfIssue}
              </td>
              <td className={`${cell} text-right tabular-nums`}>{i.onHand}</td>
              <td className={`${cell} text-right tabular-nums`}>
                {i.monthsOfStock === null || !Number.isFinite(i.monthsOfStock)
                  ? "Not enough history"
                  : Math.round(i.monthsOfStock * 10) / 10}
              </td>
              <td className={`${cell} text-right tabular-nums`}>
                {i.toMaximum === null ? "Not set" : Math.ceil(i.toMaximum)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Requested by: ______________________ Date: ____________</p>
    </div>
  );
}
