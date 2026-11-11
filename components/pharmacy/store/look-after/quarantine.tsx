"use client";

import type { ChipTone } from "@/components/pharmacy/charts/chip";
import type { QuarantineBatch, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import { quarantineDecideAction } from "@/app/pharmacy/stock/store/store-actions";
import { Chip } from "@/components/pharmacy/charts/chip";
import { field } from "@/components/pharmacy/medicines/shared";
import { LossDialog } from "@/components/pharmacy/store/dialogs/loss";
import { newKey, useStoreAct, useWitness } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { dayOf, fmtDay, fmtDow, ugx, units } from "@/lib/pharmacy/derive/store/format";
import { medOf } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { card, Empty, Head, rowLine } from "./shared";

const Q = LA.quar;
type Decide = "return" | "destroy";

const whyOf = (q: QuarantineBatch): { text: string; tone: ChipTone } => {
  if (q.why === "expired")
    return {
      text: fill(Q.expired, { day: `${fmtDay(q.exp)} ${q.exp.slice(0, 4)}` }),
      tone: "bad",
    };
  const text = q.why.replaceAll("_", " ");
  return {
    text: text.charAt(0).toUpperCase() + text.slice(1),
    tone: /^recalled/i.test(text) ? "warn" : "neutral",
  };
};
const lossTone = (reason: string): ChipTone =>
  reason === "missing" ? "bad" : reason === "destroyed" ? "neutral" : "warn";

function Batch({
  w,
  q,
  act,
  ask,
}: {
  w: StoreWorld;
  q: QuarantineBatch;
  act: ReturnType<typeof useStoreAct>;
  ask: (what: string) => Promise<string | null>;
}) {
  const m = medOf(w, q.medId);
  const [decide, setDecide] = useState<Decide>("return");
  const qty = units(q.qty, m.unit);
  const why = whyOf(q);
  const record = async () => {
    let witness: string | null = null;
    if (decide === "destroy" || m.controlled) {
      witness = await ask(
        fill(decide === "destroy" ? Q.witness : Q.witnessReturn, { name: m.name, no: q.no, qty }),
      );
      if (!witness) return;
    }
    const day = fmtDay(w.today);
    act.run(
      () =>
        quarantineDecideAction({
          clientKey: newKey(),
          batchId: q.id,
          decided: decide,
          witnessAttestationId: witness,
        }),
      fill(decide === "destroy" ? Q.destroyed : Q.returned, { day }),
    );
  };
  return (
    <div className={cn(rowLine, "flex flex-wrap items-center gap-x-3.5 gap-y-2 py-2.5")}>
      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-px">
        <b className="text-[14px] font-semibold">{m.name}</b>
        <span className="text-ink-600 text-[12px]">{fill(Q.shelf, { no: q.no })}</span>
      </span>
      <Chip tone={why.tone}>{why.text}</Chip>
      <span className="text-[13px] tabular-nums">
        {qty} · {ugx(q.qty * m.cost)}
      </span>
      <span className="flex max-w-full flex-wrap items-center gap-1.5">
        <select
          aria-label={fill(Q.aria, { name: m.name, no: q.no })}
          value={decide}
          onChange={(e) => setDecide(e.target.value as Decide)}
          className={cn(field, "max-w-full font-semibold")}
        >
          <option value="return">{Q.ret}</option>
          <option value="destroy">{Q.destroy}</option>
        </select>
        <LabButton size="sm" variant="primary" busy={act.busy} onClick={record}>
          {Q.record}
        </LabButton>
      </span>
    </div>
  );
}

/** §F5. Nothing in quarantine can be issued; both ways out write it off, with its value, into the register below. */
export function QuarantineLosses({ world: w }: { world: StoreWorld }) {
  const act = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, act.say);
  const [loss, setLoss] = useState(false);
  const month = w.today.slice(0, 7);
  const inQ = w.quarantine.reduce((a, q) => a + q.qty * medOf(w, q.medId).cost, 0);
  const lossTotal = w.losses
    .filter((l) => dayOf(l.at).slice(0, 7) === month)
    .reduce((a, l) => a + l.value, 0);
  return (
    <>
      <section className={cn(card, "gap-1.5")}>
        <Head title={fill(Q.title, { value: ugx(inQ) })} note={Q.lead} />
        {w.quarantine.length ? (
          w.quarantine.map((q) => <Batch key={q.id} w={w} q={q} act={act} ask={ask} />)
        ) : (
          <Empty>{Q.none}</Empty>
        )}
      </section>
      <section className={cn(card, "gap-1.5")}>
        <Head
          title={fill(Q.losses, { value: ugx(lossTotal) })}
          action={<LabButton onClick={() => setLoss(true)}>{Q.recordLoss}</LabButton>}
        />
        {w.losses.length ? (
          w.losses.map((l) => {
            const m = medOf(w, l.medId);
            return (
              <div
                key={l.id}
                className={cn(rowLine, "flex flex-wrap items-center gap-x-3 gap-y-1 py-2")}
              >
                <span className="text-ink-600 w-20 shrink-0 text-[12px]">
                  {fmtDow(dayOf(l.at))}
                </span>
                <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-px">
                  <b className="text-[13px] font-semibold">{m.name}</b>
                  <span className="text-ink-600 text-[12px]">
                    {[l.no, units(l.qty, m.unit), l.note].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Chip tone={lossTone(l.reason)}>{Q.reason[l.reason] ?? l.reason}</Chip>
                  <b className="text-[13px] font-semibold tabular-nums">{ugx(l.value)}</b>
                </span>
              </div>
            );
          })
        ) : (
          <Empty>{Q.lossNone}</Empty>
        )}
      </section>
      <LossDialog world={w} open={loss} onOpenChange={setLoss} />
      {act.toast}
      {dialog}
    </>
  );
}
