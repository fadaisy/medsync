import { and, eq, gte, lte } from "drizzle-orm";

import { LAB2 } from "@/content/lab-phase-2";
import { db } from "@/db";
import { downtimeFormNumbers } from "@/db/schema/lab-safety";
import { formLabel } from "@/lib/lab/downtime-store";
import { labHighRiskLiveFor } from "@/lib/lab/feature";
import { PrintButton } from "../../../downtime/print/print-button";

/** The from/to of a print run: integers, in order, at most 200 apart; else null (the page 404s). */
export function printRange(from?: string, to?: string): { a: number; b: number } | null {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 200) return null;
  return { a, b };
}

/**
 * The paper form (§5.9, artboard 12; E-LAB1-06): print CSS only, black on white, legible in
 * greyscale, one reserved number per A4 sheet. Only numbers reserved here and still unused print.
 * Rendered by /lab/bench/downtime/print and, while v2 is off, /lab/downtime/print.
 */
export async function PrintFormsView({
  scope,
  a,
  b,
}: {
  scope: { hospitalId: string; hospitalName: string };
  a: number;
  b: number;
}) {
  const rows = await db
    .select({ number: downtimeFormNumbers.number })
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, scope.hospitalId),
        eq(downtimeFormNumbers.state, "unused"),
        gte(downtimeFormNumbers.number, a),
        lte(downtimeFormNumbers.number, b),
      ),
    )
    .orderBy(downtimeFormNumbers.number);
  // HR-5: the form prints blank, so the high-risk box is a square to tick by hand.
  const highRisk = labHighRiskLiveFor(scope.hospitalId);
  const line = "border-b border-black min-h-7";
  const box = "border border-black p-2";
  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <div className="flex items-center gap-3 print:hidden">
        <p className="text-body-s">
          {rows.length} {rows.length === 1 ? "form" : "forms"} to print, one number on each sheet.
          Print on A4.
        </p>
        <PrintButton />
      </div>
      {rows.map((r) => (
        <article
          key={r.number}
          className="flex min-h-[277mm] [break-after:page] flex-col gap-3 bg-white p-[10mm] text-[12px] leading-snug text-black last:[break-after:auto] print:min-h-0 print:p-[8mm]"
        >
          <header className="flex items-start justify-between border-b-2 border-black pb-2">
            <div>
              <p className="text-[16px] font-semibold">Laboratory result form, downtime</p>
              <p>{scope.hospitalName} · Laboratory</p>
            </div>
            <p className="font-mono text-[18px] font-semibold">{formLabel(r.number)}</p>
          </header>
          {highRisk ? (
            <section className="flex items-center gap-3 border-2 border-black p-2">
              <span aria-hidden className="size-5 shrink-0 border-2 border-black" />
              <p className="text-[14px] font-semibold">{LAB2.highRisk.labelBox}</p>
            </section>
          ) : null}
          <section className={box}>
            <p className="font-semibold">Patient</p>
            <div className="grid grid-cols-3 gap-3">
              <p className={line}>Name</p>
              <p className={line}>MRN</p>
              <p className={line}>Age and sex</p>
            </div>
          </section>
          <section className={box}>
            <p className="font-semibold">Request</p>
            <div className="grid grid-cols-3 gap-3">
              <p className={line}>Test(s)</p>
              <p className={line}>Requested by</p>
              <p className={line}>Ward</p>
            </div>
          </section>
          <section className={box}>
            <p className="font-semibold">Specimen</p>
            <div className="grid grid-cols-3 gap-3">
              <p className={line}>Type</p>
              <p className={line}>Collected: date</p>
              <p className={line}>Collected: time</p>
            </div>
          </section>
          <section className={box}>
            <p className="font-semibold">Results</p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Test", "Result", "Unit", "Range used", "High or low"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="border border-black px-1 py-0.5 text-left font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j} className="h-7 border border-black" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className={box}>
            <p className="font-semibold">Critical result (if any)</p>
            <div className="grid grid-cols-4 gap-3">
              <p className={line}>Phoned to</p>
              <p className={line}>Their role</p>
              <p className={line}>Time</p>
              <p className={line}>Read back: yes / no</p>
            </div>
          </section>
          <section className={box}>
            <p className="font-semibold">Release and entry</p>
            <div className="grid grid-cols-2 gap-3">
              <p className={line}>Released on paper by, and time</p>
              <p className={line}>Entered in MedSync by, and time</p>
            </div>
          </section>
          <p className="mt-auto">
            Keep this sheet. Enter it in MedSync, Downtime entry, as soon as the system is back.
            Number {formLabel(r.number)} can be entered once.
          </p>
        </article>
      ))}
    </div>
  );
}
