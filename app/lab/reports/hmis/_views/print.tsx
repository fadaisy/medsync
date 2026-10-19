import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { StoredCell } from "@/lib/lab/hmis-store";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { fill, LAB3_HMIS } from "@/content/lab-phase-3";
import { db } from "@/db";
import { labHmisReports, testCatalogue, users } from "@/db/schema";
import { hmisForm } from "@/lib/lab/hmis-form";
import { cellKey, rowKey } from "@/lib/lab/hmis105";
import { dateWords, timeWords } from "../../../_lib/days";
import { PrintButton } from "../../../downtime/print/print-button";
import { monthWords, validMonth } from "../../../hmis/_lib/month";

const H = LAB3_HMIS;
const cellCls = "border border-black px-1 py-0.5";

/**
 * HM-12: the printed form, laid out as section 10 and the laboratory rows of section 6 (A4 landscape, print CSS,
 * black on white, 12 px body, 1 px rules). Aggregates only. Blank cells print empty; zeros print 0. Moved here
 * unchanged from /lab/hmis/print; the old and the new route both render it (S31).
 */
export async function HmisPrintBody({
  scope,
  sp,
}: {
  scope: Pick<LabTechScope, "hospitalId" | "hospitalName">;
  sp: { month?: string; rev?: string };
}) {
  const now = new Date();
  const month = validMonth(sp.month, now);
  const [r] = await db
    .select({ report: labHmisReports, signer: users.fullName })
    .from(labHmisReports)
    .leftJoin(users, eq(users.id, labHmisReports.signedBy))
    .where(
      and(
        eq(labHmisReports.hospitalId, scope.hospitalId),
        eq(labHmisReports.month, `${month}-01`),
        eq(labHmisReports.revision, Number(sp.rev) || 1),
      ),
    );
  if (!r) notFound();
  const tests = await db
    .select({ code: testCatalogue.code, name: testCatalogue.display })
    .from(testCatalogue);
  const testName = new Map(tests.map((t) => [t.code, t.name]));
  const { form } = hmisForm();
  const cells = r.report.cells as Record<string, StoredCell>;
  const v = (row: string, column: string) => {
    const c = cells[cellKey(row, column)];
    return c && c.value !== null ? c.value.toLocaleString("en-GB") : "";
  };
  const extra10_5 = [
    ...new Set(
      Object.keys(cells)
        .map((k) => k.split("|")[0]!)
        .filter((k) => k.startsWith("test.")),
    ),
  ];
  return (
    <div className="mx-auto flex w-full max-w-[297mm] flex-col gap-3 bg-white px-4 py-6 text-[12px] leading-snug text-black print:max-w-none print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: white !important; } aside, header, nav, [data-print-hide] { display: none !important; } }`}</style>
      <div className="flex items-center gap-3 print:hidden" data-print-hide>
        <PrintButton />
      </div>
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-[16px] font-semibold">
            HMIS 105 · Section 10 Laboratory, and Section 6 lab tracer items
          </p>
          <p>
            {scope.hospitalName} · {monthWords(month)} ·{" "}
            {fill(H.status.revision, { n: r.report.revision })} · form {form.version}
            {form.verified ? "" : ` · ${H.unverified}`}
          </p>
        </div>
        <p className="text-right">
          Printed {dateWords(now)} {timeWords(now)}
        </p>
      </div>
      {form.sections.map((s) => {
        const rows = form.rows.filter((x) => x.section === s.id);
        const list =
          s.id === "10.5"
            ? extra10_5.map((t) => ({ key: t, code: "", label: testName.get(t) ?? t }))
            : rows.map((x) => ({ key: rowKey(x), code: x.code ?? "", label: x.label }));
        if (!list.length || !s.columns.length) return null;
        return (
          <section key={s.id} className="break-inside-avoid">
            <p className="pt-2 font-semibold">
              {s.id} {s.title}
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${cellCls} text-left`}>Code</th>
                  <th className={`${cellCls} text-left`}>Row</th>
                  {s.columns.map((c) => (
                    <th key={c} className={`${cellCls} text-right font-semibold`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.key}>
                    <td className={`${cellCls} font-mono`}>{x.code}</td>
                    <td className={cellCls}>{x.label}</td>
                    {s.columns.map((c) => (
                      <td key={c} className={`${cellCls} text-right font-mono tabular-nums`}>
                        {v(x.key, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="pt-4">
        {r.report.signedAt
          ? `Signed by the Health Unit In-charge ${r.signer ?? ""} on ${dateWords(r.report.signedAt)}.`
          : "Health Unit In-charge: ____________________ Signature: ____________ Date: ____________"}
      </p>
    </div>
  );
}
