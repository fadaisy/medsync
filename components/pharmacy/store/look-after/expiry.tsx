"use client";

import type { ExpRow } from "@/lib/pharmacy/derive/store/expiry";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import {
  expiryActionAction,
  moveToQuarantineAction,
} from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { field } from "@/components/pharmacy/medicines/shared";
import { newKey, useStoreAct, useWitness } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { bestPlace, expRows } from "@/lib/pharmacy/derive/store/expiry";
import { fmtExp, monthsTo, num, ugx, units } from "@/lib/pharmacy/derive/store/format";
import { medOf, placeName } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { card, Empty, Head, rowLine } from "./shared";

const E = LA.exp;
type Do = "move" | "first" | "return";
type Ask = (what: string) => Promise<string | null>;
type Act = ReturnType<typeof useStoreAct>;

/** The loader keeps what was done as JSON: the action, its voucher, the place. */
const doneWords = (raw: string) => {
  const d = JSON.parse(raw) as { action: Do; voucher: string | null; to: string | null };
  return d.action === "move"
    ? fill(E.moved, { place: d.to ?? "", voucher: d.voucher ?? "" })
    : d.action === "return"
      ? E.returned
      : E.marked;
};

function Row({ w, e, act, ask }: { w: StoreWorld; e: ExpRow; act: Act; ask: Ask }) {
  const { batch: b, med: m, risk, months } = e;
  const best = bestPlace(w, m.id);
  const opts: { v: Do; label: string }[] =
    risk > 0
      ? [
          ...(best
            ? [
                {
                  v: "move" as const,
                  label: fill(E.move, { n: num(risk), place: placeName(w, best) }),
                },
              ]
            : []),
          { v: "first", label: E.first },
          { v: "return", label: fill(E.ret, { n: num(risk) }) },
        ]
      : [{ v: "first", label: E.first }];
  const [picked, setPicked] = useState<Do>(opts[0]!.v);
  const chosen = opts.find((o) => o.v === picked) ?? opts[0]!;
  const expired = !!b.blocked && b.exp < w.today;
  const qty = units(b.qty, m.unit);

  const record = async () => {
    let witness: string | null = null;
    if (m.controlled && chosen.v !== "first") {
      witness = await ask(fill(E.witnessMove, { name: m.name, no: b.no, action: chosen.label }));
      if (!witness) return;
    }
    act.run(
      () =>
        expiryActionAction({
          clientKey: newKey(),
          batchId: b.id,
          action: chosen.v,
          quantity: chosen.v === "first" ? undefined : risk,
          witnessAttestationId: witness,
        }),
      (d) =>
        chosen.v === "move"
          ? fill(E.moved, { place: placeName(w, best ?? ""), voucher: d?.voucher ?? "" })
          : chosen.v === "return"
            ? E.returned
            : E.marked,
    );
  };
  const quarantine = async () => {
    let witness: string | null = null;
    if (m.controlled) {
      witness = await ask(fill(E.witnessQuarantine, { name: m.name, no: b.no, qty }));
      if (!witness) return;
    }
    act.run(
      () =>
        moveToQuarantineAction({
          clientKey: newKey(),
          locationId: w.storeId,
          batchId: b.id,
          quantity: b.qty,
          reasonCode: expired ? "expired" : "recalled",
          witnessAttestationId: witness,
        }),
      fill(E.inQuarantine, { name: m.name, no: b.no }),
    );
  };

  return (
    <div className={cn(rowLine, "flex flex-wrap items-center gap-x-4 gap-y-2 py-3")}>
      <span className="flex min-w-0 flex-[1_1_280px] flex-col items-start gap-0.5">
        <b className="text-[14px] font-semibold">{m.name}</b>
        <span className="text-ink-600 text-[12px]">
          {[b.bin, b.no, qty].filter(Boolean).join(" · ")}
        </span>
        {b.blocked ? (
          <Chip tone="bad" className="mt-0.5">
            {fill(E.blocked, { value: ugx(b.qty * m.cost) })}
          </Chip>
        ) : risk ? (
          <Chip tone="bad" className="mt-0.5">
            {fill(E.risk, { qty: units(risk, m.unit), value: ugx(risk * m.cost) })}
          </Chip>
        ) : (
          <Chip tone="ok" className="mt-0.5">
            {fill(E.safe, { n: num(m.use) })}
          </Chip>
        )}
      </span>
      <Chip tone={b.blocked || months <= w.rules.expiryBad ? "bad" : "warn"}>
        {b.blocked
          ? fill(expired ? E.expired : E.recalled, { exp: fmtExp(b.exp) })
          : fill(E.months, { exp: fmtExp(b.exp), n: Math.max(0, months).toFixed(1) })}
      </Chip>
      <span className="flex max-w-full flex-wrap items-center gap-1.5">
        {b.blocked ? (
          <LabButton size="sm" busy={act.busy} onClick={quarantine}>
            {E.toQuarantine}
          </LabButton>
        ) : e.done ? (
          <Tag>{doneWords(e.done)}</Tag>
        ) : (
          <>
            <select
              aria-label={fill(E.aria, { name: m.name, no: b.no })}
              value={chosen.v}
              onChange={(ev) => setPicked(ev.target.value as Do)}
              className={cn(field, "max-w-full font-semibold")}
            >
              {opts.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <LabButton size="sm" variant="primary" busy={act.busy} onClick={record}>
              {E.doIt}
            </LabButton>
          </>
        )}
      </span>
    </div>
  );
}

/** §F2. The window from the rules, soonest first; a recalled batch stays listed however far off its date is. */
export function Expiry({ world: w }: { world: StoreWorld }) {
  const act = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, act.say);
  const rows: ExpRow[] = [
    ...expRows(w),
    ...w.batches
      .filter((b) => b.blocked && monthsTo(b.exp, w.today) > w.rules.expiryWindow)
      .map((b) => {
        const med = medOf(w, b.medId);
        return {
          batch: b,
          med,
          months: monthsTo(b.exp, w.today),
          risk: b.qty,
          value: b.qty * med.cost,
          done: null,
        };
      }),
  ];
  return (
    <section className={cn(card, "gap-2.5")}>
      <Head title={fill(E.title, { n: w.rules.expiryWindow })} note={E.lead} />
      {rows.length ? (
        rows.map((e) => <Row key={e.batch.id} w={w} e={e} act={act} ask={ask} />)
      ) : (
        <Empty>{fill(E.none, { n: w.rules.expiryWindow })}</Empty>
      )}
      {act.toast}
      {dialog}
    </section>
  );
}
