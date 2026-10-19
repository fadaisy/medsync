import "server-only";

import type { LabTechScope } from "@/lib/lab-tech/scope";
import { notFound } from "next/navigation";

import { fill, LAB4 } from "@/content/lab-phase-4";
import { LABWS2_SEND_OUTS } from "@/content/lab-workspace-v2-send-outs";
import { db } from "@/db";
import { code128Svg } from "@/lib/lab/code128";
import { manifestRows } from "@/lib/lab/manifest";
import { loadManifest } from "@/lib/lab/referral-read";
import { PrintManifest } from "../_components/print-manifest";
import { dateWords } from "../../_lib/days";

const time = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });

/**
 * The printed manifest (Lab Phase 4 §5.2, artboard 2; MF-1..MF-4): A4 portrait, black on white, body 12 px, the
 * manifest number as Code 128. No patient names and no clinical details: the rows are built by `manifestRows`,
 * whose input has no field for them; a restricted test prints as the partner's code (A18). Rendered by the
 * Send-outs print route and the old /lab/refer one.
 */
export async function ManifestPrint({ scope, id }: { scope: LabTechScope; id: string }) {
  const m = await db.transaction((tx) => loadManifest(tx, scope.hospitalId, id));
  if (!m) notFound();
  const rows = manifestRows(m.items);
  const cell = "border border-black px-[7px] py-[5px] text-left align-top";
  const now = new Date();
  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <p className="text-body-s">
          {m.manifest.state === "open"
            ? LABWS2_SEND_OUTS.sealBeforePrinting
            : `Print on A4. ${m.printed ? "This print will say Copy." : ""}`}
        </p>
        {m.manifest.state !== "open" ? <PrintManifest manifestId={m.manifest.id} /> : null}
      </div>
      <article className="flex min-h-[277mm] flex-col gap-3 bg-white p-[12mm] text-[12px] leading-snug text-black print:min-h-0 print:p-[10mm]">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[20px] font-semibold">
              Specimen referral manifest{m.printed ? " · Copy" : ""}
            </h1>
            <p>{scope.hospitalName} · Laboratory</p>
            <p>
              Printed {dateWords(now)} · {time(now)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div
              dangerouslySetInnerHTML={{
                __html: code128Svg(m.manifest.number, { height: 44, module: 2 }),
              }}
            />
            <p className="font-mono text-[14px] font-semibold">{m.manifest.number}</p>
          </div>
        </header>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <th scope="row" className={`${cell} w-[150px] font-semibold`}>
                To
              </th>
              <td className={cell}>{m.partner}</td>
              <th scope="row" className={`${cell} w-[120px] font-semibold`}>
                Travels by
              </th>
              <td className={cell}>{m.manifest.transport}</td>
            </tr>
            <tr>
              <th scope="row" className={`${cell} font-semibold`}>
                Specimens
              </th>
              <td className={cell}>{rows.length}</td>
              <th scope="row" className={`${cell} font-semibold`}>
                Packages
              </th>
              <td className={cell}>{m.manifest.packages ?? "—"}</td>
            </tr>
          </tbody>
        </table>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["#", "Our lab no.", "Their form no.", "Specimen", "Tubes", "Test", "Collected"].map(
                (h) => (
                  <th key={h} scope="col" className={`${cell} font-semibold`}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.position}>
                <td className={cell}>{r.position}</td>
                <td className={`${cell} font-mono`}>{r.labNumber}</td>
                <td className={`${cell} font-mono`}>{r.theirIds}</td>
                <td className={cell}>{r.specimen}</td>
                <td className={cell}>{r.containers}</td>
                <td className={cell}>{r.test}</td>
                <td className={cell}>
                  {dateWords(r.collectedAt)} · {time(r.collectedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{LAB4.manifestFooter}</p>
        <div className="grid grid-cols-2 border border-black">
          {[
            [
              "Packed and checked by",
              `${scope.fullName ?? "Lab"} · Lab`,
              "Signature: ____________________ Time: ________",
            ],
            [
              "Handed to (courier or rider)",
              "Name: ______________________________",
              "Signature: ____________________ Time: ________",
            ],
            [
              "Received at the destination",
              "Name: ______________________________",
              "Signature: ____________________ Time: ________",
            ],
            [
              "Condition on arrival",
              "☐ All intact   ☐ Leaking   ☐ Broken   ☐ Missing",
              "Number received: ______",
            ],
          ].map(([title, a, b], i) => (
            <div
              key={title}
              className={`flex min-h-[66px] flex-col gap-1.5 p-2 ${i % 2 === 0 ? "border-r border-black" : ""} ${i < 2 ? "border-b border-black" : ""}`}
            >
              <b>{title}</b>
              <span>{a}</span>
              <span>{b}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <footer className="flex justify-between gap-6 border-t border-black pt-2">
          <span>
            Please sign and return this sheet with the results, or confirm receipt in the reference
            lab&apos;s system.
          </span>
          <span>{fill("MedSync · {n}", { n: m.manifest.number })}</span>
        </footer>
      </article>
    </div>
  );
}
