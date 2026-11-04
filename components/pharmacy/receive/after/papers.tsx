"use client";

import type { ReceiveDelivery } from "@/lib/pharmacy/derive/receive";

import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-receive";
import { RA } from "@/content/pharmacy-receive-after";
import { atText, expText, lineInfo, normExp, num, plural } from "@/lib/pharmacy/derive/receive";
import { useReceive } from "../provider";
import { Frame } from "./frame";
import { PrintStyle } from "./print";

const P = RA.papers;

/**
 * RECEIVE §E2: the Goods received note, and the Discrepancy report (HMIS 087) when a line differs. Printable. The
 * national form's columns are not confirmed, so the report says so and none are invented.
 */
export function PaperDialog({
  delivery: d,
  which,
  onClose,
}: {
  delivery: ReceiveDelivery;
  which: "grn" | "report";
  onClose: () => void;
}) {
  const { world } = useReceive();
  const report = which === "report";
  const infos = d.lines.map((l) => ({ l, i: lineInfo(l, d, world) }));
  const shown = report ? infos.filter((x) => x.i.words.some((w) => w.caution)) : infos;
  const head: [string, string][] = [
    [P.head.facility, world.facility],
    [P.head.supplier, d.source],
    [P.head.note, d.note],
    [P.head.arrived, atText(d.arrived)],
    [P.head.place, world.places.find((p) => p.id === d.place)?.name ?? RC.dash],
    [P.head.deliverer, d.deliverer || RC.dash],
    [P.head.vehicle, d.vehicle || RC.dash],
    [P.head.grn, d.grn],
  ];
  const cells = ({ l, i }: (typeof infos)[number]) => {
    const common = [String(l.no), i.m.name, l.batch || RC.dash, expText(normExp(l.exp), l.exp)];
    return report
      ? [
          ...common,
          l.notePacks === "" ? RC.dash : plural(Number(l.notePacks), "pack"),
          plural(i.packs, "pack"),
          plural(i.acc, "pack"),
          plural(i.rej, "pack"),
          i.words
            .filter((w) => w.caution)
            .map((w) => w.word)
            .join("; "),
          (l.decision && P.decision[l.decision]) || "",
        ]
      : [
          ...common,
          plural(i.accUnits, i.m.unit),
          l.cost === "" ? P.noCost : num(Number(l.cost)),
          l.witnessName || (i.m.controlled ? P.notRecorded : RC.dash),
        ];
  };
  return (
    <Frame
      title={report ? P.report : P.grn}
      onClose={onClose}
      width="wide"
      printArea
      foot={
        <>
          <LabButton onClick={onClose}>{P.close}</LabButton>
          <LabButton variant="primary" onClick={() => window.print()}>
            {P.print}
          </LabButton>
        </>
      }
    >
      <PrintStyle />
      <div className="flex flex-col gap-3">
        <h3 className="text-foreground m-0 hidden text-[18px] font-semibold print:block">
          {report ? P.report : P.grn}
        </h3>
        {report ? <p className="text-ink-700 m-0 text-[13px] leading-5">{P.notNational}</p> : null}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-2 text-[13px]">
          {head.map(([k, v]) => (
            <span key={k}>
              {k}: <b>{v}</b>
            </span>
          ))}
        </div>
        <div tabIndex={0} className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {(report ? P.reportCols : P.grnCols).map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="border-ink-300 border-b px-2 py-1.5 text-left align-bottom font-semibold"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.l.id}>
                  {cells(x).map((v, k) => (
                    <td key={k} className="border-ink-200 border-b px-2 py-1.5 align-top">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {P.signs.map((s) => (
            <div
              key={s}
              className="border-ink-500 flex flex-col gap-0.5 border-t pt-1.5 text-[13px] font-semibold"
            >
              {s}
              <span className="text-ink-600 text-[11.5px] font-normal">{P.signHint}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}
