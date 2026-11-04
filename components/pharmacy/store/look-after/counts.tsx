"use client";

import type { Shelf, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  closeStocktakeAction,
  saveShelfAction,
  signOffCountAction,
  startStocktakeAction,
} from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { FormDialog, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { CountShelfDialog } from "@/components/pharmacy/store/dialogs/count";
import { useSave } from "@/components/pharmacy/store/dialogs/shared";
import { newKey, useStoreAct, useWitness } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { shelfBatches, shelfDue } from "@/lib/pharmacy/derive/store/counts";
import { dayOf, fmtDay, ugx } from "@/lib/pharmacy/derive/store/format";
import { medOf } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { card, Empty, Head, rowLine } from "./shared";

const C = LA.count;
const S = C.shelf;

const dueWord = (s: Shelf, w: StoreWorld) =>
  s.countedToday
    ? C.today
    : shelfDue(s, w.rules)
      ? s.controlled
        ? C.dueToday
        : s.days === null
          ? C.dueNever
          : fill(C.due, { n: s.days })
      : s.days === 1
        ? C.agoOne
        : fill(C.ago, { n: s.days ?? 0 });

/** Two words per shelf, as Med Name. Names only: a count is blind. */
const medsOn = (w: StoreWorld, code: string) =>
  [
    ...new Set(
      shelfBatches(w, code).map((b) => medOf(w, b.medId).name.split(" ").slice(0, 2).join(" ")),
    ),
  ].join(", ");

function AddShelf({ onClose, say }: { onClose: () => void; say: (m: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [controlled, setControlled] = useState(false);
  const [clientKey] = useState(newKey);
  const { pending, error, setError, go } = useSave();
  const save = () => {
    if (!code.trim()) return setError(S.errCode);
    if (name.trim().length < 2) return setError(S.errName);
    go(
      () => saveShelfAction({ clientKey, code, name, controlled }),
      () => {
        say(fill(S.saved, { code: code.trim().toUpperCase() }));
        onClose();
      },
    );
  };
  return (
    <FormDialog
      open
      onClose={onClose}
      title={S.title}
      sub={S.lead}
      error={error}
      submit={S.save}
      onSubmit={save}
      pending={pending}
    >
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{S.code}</span>
          <input
            value={code}
            onChange={(e) => (setCode(e.target.value.toUpperCase()), setError(""))}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{S.name}</span>
          <input
            value={name}
            onChange={(e) => (setName(e.target.value), setError(""))}
            className={inputCls}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={controlled}
          onChange={(e) => setControlled(e.target.checked)}
        />
        {S.controlled}
      </label>
    </FormDialog>
  );
}

/** §F4. `?shelf=` opens the count on that shelf; closing clears it. The Count buttons open it straight away. */
export function Counts({ world: w, shelfId }: { world: StoreWorld; shelfId: string | null }) {
  const router = useRouter();
  const act = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, act.say);
  const [chosen, setChosen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!shelfId && dismissed) setDismissed(null);
  const counting = chosen ?? (shelfId !== dismissed ? shelfId : null);
  const closeCount = () => {
    setChosen(null);
    if (shelfId) {
      setDismissed(shelfId);
      router.replace("?tab=main&section=count", { scroll: false });
    }
  };

  const take = w.stocktake && !w.stocktake.closedAt ? w.stocktake : null;
  const inTake = take ? w.counts.filter((c) => c.stocktakeId === take.id) : [];
  const latest = [...new Map([...inTake].reverse().map((c) => [c.shelfId, c])).values()];
  const allCounted = !!take && w.shelves.every((s) => s.inStocktake);
  const toggle = () => {
    if (!take) return act.run(() => startStocktakeAction({ clientKey: newKey() }), C.started);
    if (!allCounted) return act.say(C.allFirst);
    const waiting = latest.filter((c) => c.needsSign && !c.signed);
    if (waiting.length)
      return act.say(
        fill(C.signFirst, {
          codes: waiting
            .map((c) => w.shelves.find((s) => s.id === c.shelfId)?.code)
            .filter(Boolean)
            .join(", "),
        }),
      );
    act.run(() => closeStocktakeAction({ stocktakeId: take.id }), C.closed);
  };
  const lastClosed = w.stocktake?.closedAt ? w.stocktake : null;
  const line = take
    ? fill(C.line, {
        n: w.shelves.filter((s) => s.inStocktake).length,
        m: w.shelves.length,
        value: ugx(latest.reduce((a, c) => a + c.diffValue, 0)),
      })
    : lastClosed
      ? fill(C.last, {
          day: `${fmtDay(dayOf(lastClosed.closedAt!))} ${dayOf(lastClosed.closedAt!).slice(0, 4)}`,
          value: ugx(
            w.counts
              .filter((c) => c.stocktakeId === lastClosed.id)
              .reduce((a, c) => a + c.diffValue, 0),
          ),
        })
      : C.never;

  const sign = async (s: Shelf, countId: string, value: number) => {
    let witness: string | null = null;
    if (s.controlled || shelfBatches(w, s.code).some((b) => medOf(w, b.medId).controlled)) {
      witness = await ask(fill(C.witnessSign, { code: s.code, value: ugx(value) }));
      if (!witness) return;
    }
    act.run(
      () => signOffCountAction({ countId, witnessAttestationId: witness }),
      fill(C.signedBy, { name: w.actor.name }),
    );
  };

  return (
    <section className={cn(card, "gap-2.5")}>
      <Head
        title={C.title}
        note={fill(C.lead, { every: w.rules.countEvery, value: ugx(w.rules.countSign) })}
        action={
          <span className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="flex flex-wrap gap-2">
              <LabButton size="sm" onClick={() => setAdding(true)}>
                {C.addShelf}
              </LabButton>
              <LabButton
                size="sm"
                variant={take ? "secondary" : "primary"}
                busy={act.busy}
                onClick={toggle}
              >
                {take ? (allCounted ? C.close : C.running) : C.start}
              </LabButton>
            </span>
            <span className="text-ink-600 text-[12px]">{line}</span>
          </span>
        }
      />
      {w.shelves.length ? (
        w.shelves.map((s) => {
          const mine = w.counts.filter((c) => c.shelfId === s.id);
          const waiting = mine.find((c) => c.needsSign && !c.signed);
          const res = waiting ?? (s.countedToday ? mine[0] : undefined);
          return (
            <div
              key={s.id}
              className={cn(rowLine, "flex flex-wrap items-center gap-x-3.5 gap-y-2 py-2.5")}
            >
              <span className="flex-[0_0_4rem] text-[15px] font-semibold">{s.code}</span>
              <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-px">
                <b className="text-[14px] font-semibold">{s.name}</b>
                <span className="text-ink-600 text-[12px]">{medsOn(w, s.code)}</span>
              </span>
              <Tag>{dueWord(s, w)}</Tag>
              {res ? (
                res.diffValue ? (
                  <>
                    <Chip tone={res.needsSign && !res.signed ? "bad" : "warn"}>
                      {fill(C.diff, { value: ugx(res.diffValue) })}
                    </Chip>
                    <Tag>{res.needsSign ? (res.signed ? C.signed : C.needsSign) : C.posted}</Tag>
                  </>
                ) : (
                  <Chip tone="ok">{C.matches}</Chip>
                )
              ) : null}
              {waiting ? (
                <LabButton
                  size="sm"
                  busy={act.busy}
                  disabledReason={w.actor.inCharge ? undefined : STORE_SAYS.inChargeOnly}
                  onClick={() => sign(s, waiting.id, waiting.diffValue)}
                >
                  {C.sign}
                </LabButton>
              ) : null}
              <LabButton
                size="sm"
                aria-label={fill(C.actionAria, { code: s.code })}
                onClick={() => setChosen(s.id)}
              >
                {C.action}
              </LabButton>
            </div>
          );
        })
      ) : (
        <Empty>{C.none}</Empty>
      )}
      <CountShelfDialog
        world={w}
        open={counting !== null}
        onOpenChange={(o) => {
          if (!o) closeCount();
        }}
        shelfId={counting}
      />
      {adding ? <AddShelf onClose={() => setAdding(false)} say={act.say} /> : null}
      {act.toast}
      {dialog}
    </section>
  );
}
