"use client";

import { useEffect, useRef } from "react";

import { assignInHouseCodeAction } from "@/app/pharmacy/stock/store/receive-actions";
import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-receive";
import { RA } from "@/content/pharmacy-receive-after";
import { labelDigits } from "@/lib/pharmacy/barcode";
import { expText, lineInfo, normExp, plural } from "@/lib/pharmacy/derive/receive";
import { useReceive } from "../provider";
import { Frame } from "./frame";
import { Ean13, PrintStyle } from "./print";

/**
 * RECEIVE §E1: one label per batch put away: the shelf code large, the medicine, batch · expiry · quantity and a real
 * EAN-13. A medicine without a code gets an in-house one when this opens, saved so the label scans next time.
 */
export function LabelsDialog({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const { world, run } = useReceive();
  const d = world.deliveries.find((x) => x.id === deliveryId);
  const asked = useRef(false);

  const rows = (d?.put ?? []).flatMap((p) => {
    const l = d?.lines.find((x) => x.id === p.lineId);
    return d && l ? [{ p, l, i: lineInfo(l, d, world) }] : [];
  });
  const missing = [
    ...new Map(rows.filter((r) => !labelDigits(r.i.m.gtin)).map((r) => [r.i.m.id, r.i.m])).values(),
  ];

  useEffect(() => {
    if (asked.current || !missing.length) return;
    asked.current = true;
    run(
      async () => {
        const given: string[] = [];
        for (const m of missing) {
          const r = await assignInHouseCodeAction({ productId: m.id });
          if (!r.ok) return r;
          // Only a code made just now is news: one that already existed is not announced again.
          if (!m.gtin && r.data?.gtin)
            given.push(`${m.name.split(" ")[0]} ${labelDigits(r.data.gtin) ?? r.data.gtin}`);
        }
        return { ok: true as const, data: given };
      },
      (given) => (given.length ? RA.labels.given(given) : undefined),
    );
  });

  if (!d) return null;
  return (
    <Frame
      title={RA.labels.title(d.grn)}
      lead={RA.labels.lead}
      onClose={onClose}
      width="wide"
      printArea
      foot={
        <>
          <LabButton onClick={onClose}>{RA.labels.close}</LabButton>
          <LabButton variant="primary" onClick={() => window.print()}>
            {RA.labels.print}
          </LabButton>
        </>
      }
    >
      <PrintStyle />
      {rows.length ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
          {rows.map(({ p, l, i }) => {
            const digits = labelDigits(i.m.gtin);
            return (
              <div
                key={p.lineId}
                className="border-ink-400 flex break-inside-avoid flex-col gap-1 rounded-xl border border-dashed bg-white p-3 text-black"
              >
                <span className="text-[20px] leading-6 font-bold tracking-[0.02em]">
                  {p.shelf || i.m.shelf || RC.dash}
                </span>
                <b className="text-[13px] leading-[17px]">{i.m.name}</b>
                <span className="text-[12px]">
                  {RA.labels.meta(
                    l.batch,
                    expText(normExp(l.exp), l.exp),
                    plural(p.qty + p.sent, i.m.unit),
                  )}
                </span>
                {digits ? <Ean13 code={digits} label={RA.labels.barcode(digits)} /> : null}
                <span className="font-mono text-[12px] tracking-[0.12em]">
                  {digits ?? RA.labels.noCode}
                </span>
                {i.m.ownCode ? <span className="text-[12px]">{RA.labels.own}</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-ink-600 m-0 text-[14px]">{RA.labels.none}</p>
      )}
    </Frame>
  );
}
