"use client";

import type { useCount } from "../use-count";
import type { LineInfo, ReceiveDelivery, ReceiveLine } from "@/lib/pharmacy/derive/receive";

import { Tag } from "@/components/medsync/tag";
import { RCT } from "@/content/pharmacy-receive-count";
import { expText, normExp, plural } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { wrapTag } from "../../store/places/parts";
import { useReceive } from "../provider";
import { LineEdit } from "./line-edit";
import { pillCls, Said } from "./parts";

type Count = ReturnType<typeof useCount>;
const L = RCT.line;

/** One line (RECEIVE §D1 "A line"): number, name, tags, facts and words; the edit panel opens under it. */
export function LineCard({
  line: l,
  info: i,
  d,
  c,
  isOpen,
  onToggle,
}: {
  line: ReceiveLine;
  info: LineInfo;
  d: ReceiveDelivery;
  c: Count;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { world } = useReceive();
  const m = i.m;
  const R = world.rules;
  const tags = [
    m.cold ? L.tag.cold(R.tempLow, R.tempHigh) : null,
    m.controlled ? L.tag.controlled : null,
    m.regLapsed ? L.tag.regLapsed : null,
    m.local ? L.tag.local : null,
    m.vaccine ? L.tag.vaccine : null,
  ].filter((x): x is string => !!x);

  const facts: { k: string; v: string }[] = [];
  if (i.counted) {
    facts.push({ k: L.fact.into, v: i.unitsText });
    if (l.batch) facts.push({ k: L.fact.batch, v: l.batch });
    if (l.exp) facts.push({ k: L.fact.exp, v: expText(normExp(l.exp), l.exp) });
    if (i.rej > 0) facts.push({ k: L.fact.rejected, v: plural(i.rej, "pack") });
    if (l.temp !== "") facts.push({ k: L.fact.arrived, v: `${l.temp} °C` });
  } else if (l.orderLineId) {
    facts.push(
      d.blind
        ? { k: "", v: L.fact.blind }
        : { k: L.fact.onOrder, v: L.fact.notCounted(plural(i.owed, "pack")) },
    );
  } else facts.push({ k: "", v: L.fact.none });

  return (
    <article
      id={`line-${l.id}`}
      aria-label={`${L.sr}${l.no}`}
      className="border-ink-200 bg-card scroll-mt-4 rounded-xl border p-3"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
            i.counted ? "bg-tide-lagoon-tint text-teal-900" : "bg-ink-100 text-ink-600",
          )}
        >
          <span className="sr-only">{L.sr}</span>
          {l.no}
        </span>
        <span className="text-foreground min-w-0 text-[15px] leading-5 font-semibold">
          {m.name}
        </span>
        {tags.map((t) => (
          <Tag key={t} className={wrapTag}>
            {t}
          </Tag>
        ))}
        <span className="grow" />
        <span className="text-ink-600 text-[12.5px]">
          {i.counted ? L.source[l.source] : L.source.fromOrder}
        </span>
        <button type="button" className={pillCls} aria-expanded={isOpen} onClick={onToggle}>
          {isOpen ? L.close : i.counted ? L.change : L.count}
        </button>
        {i.counted || !l.orderLineId ? (
          <button
            type="button"
            className="text-primary focus-visible:ring-primary/30 min-h-11 rounded-full px-2 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 sm:min-h-9"
            onClick={() => c.removeLine(l.id)}
          >
            {L.remove}
          </button>
        ) : null}
      </div>
      <p className="text-ink-600 m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-5">
        {facts.map((f) => (
          <span key={f.k + f.v}>
            {f.k ? `${f.k} ` : ""}
            <b className="text-foreground font-semibold">{f.v}</b>
          </span>
        ))}
      </p>
      {i.counted ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {i.words.map((w) => (
            <Said key={w.word} tone={w.caution ? "warn" : "ok"}>
              {w.word}
            </Said>
          ))}
        </div>
      ) : null}
      {isOpen ? <LineEdit line={l} info={i} d={d} c={c} autoFocus onDone={onToggle} /> : null}
    </article>
  );
}
