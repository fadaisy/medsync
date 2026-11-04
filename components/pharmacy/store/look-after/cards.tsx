"use client";

import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useRouter } from "next/navigation";

import { Chip } from "@/components/pharmacy/charts/chip";
import { field, sectionTitle } from "@/components/pharmacy/medicines/shared";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { dayOf, fmtDow, fmtExp, num, ugx, units } from "@/lib/pharmacy/derive/store/format";
import { batchesOf, medOf, mosOf, onHand } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { card, Empty, rowLine, Table } from "./shared";

const C = LA.card;

/** §F3. The running balance is worked back from what is on the shelves today, newest first. */
export function StockCards({ world: w }: { world: StoreWorld }) {
  const router = useRouter();
  const med = w.card ? medOf(w, w.card.medId) : null;
  const batches = med ? batchesOf(w, med.id) : [];
  const hand = med ? onHand(w, med.id) : 0;
  const mo = med ? mosOf(w, med) : 0;
  const stats = med
    ? [
        [C.stats.balance, units(hand, med.unit)],
        [C.stats.use, num(med.use)],
        [C.stats.months, Number.isFinite(mo) ? mo.toFixed(1) : LA.health.noUse],
        [C.stats.value, ugx(hand * med.cost)],
      ]
    : [];
  const start = batches.reduce((a, b) => a + b.qty, 0);
  const rows = (w.card?.rows ?? []).map((r, i, all) => ({
    r,
    bal: start - all.slice(0, i).reduce((a, x) => a + x.delta, 0),
  }));
  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-ink-700 flex max-w-full flex-col gap-1 text-[12px] font-semibold">
          {C.pick}
          <select
            value={med?.id ?? ""}
            onChange={(e) =>
              router.push(`?tab=main&section=card&med=${e.target.value}`, { scroll: false })
            }
            className={cn(field, "max-w-full min-w-0 font-semibold sm:min-w-72")}
          >
            {med ? null : <option value="">{C.choose}</option>}
            {w.meds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-4">
          {stats.map(([k, v]) => (
            <span key={k} className="flex flex-col">
              <span className={sectionTitle}>{k}</span>
              <b className="text-[17px] font-semibold tabular-nums">{v}</b>
            </span>
          ))}
        </div>
      </div>
      {med && w.card ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {batches.map((b) => (
              <span
                key={b.id}
                className="bg-ink-50 inline-flex min-h-7 max-w-full flex-wrap items-center gap-x-1.5 rounded-full px-2.5 text-[12px]"
              >
                {b.bin ? <b className="font-semibold">{b.bin}</b> : null}
                {[b.no, fill(C.batch, { exp: fmtExp(b.exp) }), units(b.qty, med.unit)].join(" · ")}
              </span>
            ))}
            {batches.length ? null : <Chip tone="bad">{C.noBatch}</Chip>}
          </div>
          {rows.length ? (
            <Table cols={C.cols} min="min-w-[720px]">
              {rows.map(({ r, bal }, i) => (
                <tr key={`${r.at}|${r.ref}|${i}`} className={rowLine}>
                  <td className="text-ink-700 py-2 pr-3 whitespace-nowrap tabular-nums">
                    {fmtDow(dayOf(r.at))}
                  </td>
                  <td className="pr-3 font-semibold whitespace-nowrap">{r.ref}</td>
                  <td className="pr-3">{r.party || (r.isCount ? C.countParty : "")}</td>
                  <td className="pr-3 tabular-nums">{r.delta > 0 ? num(r.delta) : ""}</td>
                  <td className="pr-3 whitespace-nowrap tabular-nums">
                    {r.delta < 0 ? num(-r.delta) : r.isCount ? C.zero : ""}
                  </td>
                  <td className="pr-3 font-semibold tabular-nums">{num(bal)}</td>
                  <td className="text-ink-600">{r.by}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>{C.none}</Empty>
          )}
          <p className="text-ink-600 m-0 text-[12px]">{C.note}</p>
        </>
      ) : (
        <Empty>{C.prompt}</Empty>
      )}
    </section>
  );
}
