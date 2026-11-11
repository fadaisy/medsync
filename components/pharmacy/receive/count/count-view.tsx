"use client";

import type { ReceiveDelivery } from "@/lib/pharmacy/derive/receive";
import { useEffect, useRef, useState } from "react";

import { Tag } from "@/components/medsync/tag";
import { RCT } from "@/content/pharmacy-receive-count";
import { deliveryProblems } from "@/lib/pharmacy/derive/receive";
import { useReceive } from "../provider";
import { Panel } from "../shared";
import { useCount } from "../use-count";
import { AbandonDialog } from "./abandon-dialog";
import { DeliveryCard } from "./delivery-card";
import { FinishDialog } from "./finish-dialog";
import { LinesCard } from "./lines-card";
import { Said } from "./parts";
import { Picker } from "./picker";
import { useScan } from "./use-scan";

/**
 * Counting a delivery (RECEIVE §D): lines on the left, the delivery on the right. Everything saves as you go through
 * `useCount`; nothing here moves stock until Add to stock, which runs the one transaction on the server.
 */
export function CountView({ delivery }: { delivery: ReceiveDelivery }) {
  const { world, online, say, go } = useReceive();
  const c = useCount(delivery);
  const { d } = c;
  const an = deliveryProblems(d, world);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [pickerQ, setPickerQ] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const scan = useScan({ c, inputRef: scanRef, onPicker: setPickerQ, onOpenLine: setOpenLine });

  // Ctrl K (or Cmd K) opens the picker, with what is typed in the scan box as the search. Not over another dialog.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      const el = scanRef.current;
      setPickerQ(el && document.activeElement === el ? el.value : "");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  useEffect(() => {
    if (openLine) document.getElementById(`line-${openLine}`)?.scrollIntoView({ block: "nearest" });
  }, [openLine]);

  const ctrl = an.infos.filter((x) => x.i.counted && x.i.acc > 0 && x.i.m.controlled);
  const needSecond = an.value > world.rules.secondCheck;

  /** `finish`: resolves to the refusal's words, or null. Offline it was queued and the board is back. */
  const finish = async (
    witnesses: { lineId: string; attestationId: string }[],
    second: string | null,
  ) => {
    setFinishing(true);
    try {
      const r = await c.finish(witnesses, second);
      if ("queued" in r) {
        say(RCT.saved);
        return null;
      }
      if (!r.ok) return r.error;
      const place = world.places.find((p) => p.id === d.place);
      const claim = r.data?.claim ?? null;
      say(
        RCT.added(
          place?.name ?? "",
          place?.kind === "store",
          claim ? { supplier: d.source, total: claim.total } : null,
        ),
      );
      setFinishOpen(false);
      return null;
    } finally {
      setFinishing(false);
    }
  };

  /** `askFinish`: the witness and second-check dialog when one is needed and we are online. */
  const askFinish = () => {
    if (online && navigator.onLine && (ctrl.length || needSecond)) return setFinishOpen(true);
    void finish([], null).then((e) => e && say(e));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {d.conflict ? (
        <p role="alert" className="bg-status-caution-bg m-0 rounded-xl px-4 py-3">
          <Said tone="warn">
            {RCT.head.conflict} {d.conflict}
          </Said>
        </p>
      ) : null}
      <Panel className="flex flex-col items-start gap-2">
        <button
          type="button"
          className="text-primary focus-visible:ring-primary/30 -ml-2 min-h-11 rounded-full px-2 text-[14px] font-semibold outline-none hover:underline focus-visible:ring-2 sm:min-h-9"
          onClick={() => void c.flush().then(() => go(null))}
        >
          {RCT.head.back}
        </button>
        <h2 className="text-heading-m text-foreground m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {RCT.head.counting} <span className="font-mono text-[20px]">{d.note}</span> · {d.source}
          </span>
          {d.blind ? <Tag>{RCT.head.blind}</Tag> : null}
        </h2>
        <p className="text-ink-600 m-0 text-[14px] leading-5">{RCT.head.lead}</p>
      </Panel>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <LinesCard
          d={d}
          c={c}
          an={an}
          scan={scan}
          inputRef={scanRef}
          openLine={openLine}
          setOpenLine={setOpenLine}
          onPicker={setPickerQ}
        />
        <DeliveryCard
          d={d}
          c={c}
          an={an}
          finishing={finishing}
          onFinish={askFinish}
          onOpenLine={setOpenLine}
          onAbandon={() => setAbandonOpen(true)}
        />
      </div>

      {pickerQ !== null ? (
        <Picker
          initialQ={pickerQ}
          d={d}
          c={c}
          onClose={() => setPickerQ(null)}
          onAdded={(id) => id && setOpenLine(id)}
        />
      ) : null}
      {finishOpen ? (
        <FinishDialog
          d={d}
          lines={ctrl}
          needSecond={needSecond}
          value={an.value}
          addLabel={RCT.card.add(an.counted.length)}
          onConfirm={finish}
          onClose={() => setFinishOpen(false)}
        />
      ) : null}
      {abandonOpen ? (
        <AbandonDialog deliveryId={d.id} onClose={() => setAbandonOpen(false)} />
      ) : null}
    </div>
  );
}
