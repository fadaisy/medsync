"use client";

import type { useCount } from "../use-count";
import type { useScan } from "./use-scan";
import type { deliveryProblems, ReceiveDelivery } from "@/lib/pharmacy/derive/receive";
import type { RefObject } from "react";
import { useSyncExternalStore } from "react";

import { RCT } from "@/content/pharmacy-receive-count";
import { coldTimer, minsBetween } from "@/lib/pharmacy/derive/receive";
import { useReceive } from "../provider";
import { Panel } from "../shared";
import { LineCard } from "./line-card";
import { pillCls, Said } from "./parts";
import { ScanBand } from "./scan-band";

type Count = ReturnType<typeof useCount>;

/** Now in Kampala as `YYYY-MM-DD HH:MM`, the clock `arrived` is written in. */
const nowKampala = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "Africa/Kampala" }).slice(0, 16);

const tick = (onChange: () => void) => {
  const t = setInterval(onChange, 30_000);
  return () => clearInterval(t);
};

/** The cold-chain timer: a 30 s tick, amber at two-thirds of the limit, red past it. Empty until mounted. */
function ColdTimer({ arrived }: { arrived: string }) {
  const { world } = useReceive();
  const now = useSyncExternalStore(tick, nowKampala, () => null);
  if (!now) return null;
  const t = coldTimer(minsBetween(arrived, now) ?? 0, world.rules.coldMins);
  return (
    <p
      role="status"
      className={
        t.tone === "bad"
          ? "bg-status-critical-bg m-0 rounded-xl px-3 py-2.5"
          : t.tone === "warn"
            ? "bg-status-caution-bg m-0 rounded-xl px-3 py-2.5"
            : "bg-tide-sunken m-0 rounded-xl px-3 py-2.5"
      }
    >
      <Said tone={t.tone}>{t.text}</Said>
    </p>
  );
}

/** The lines card (RECEIVE §D1): the cold timer, the scan band, every line. */
export function LinesCard({
  d,
  c,
  an,
  scan,
  inputRef,
  openLine,
  setOpenLine,
  onPicker,
}: {
  d: ReceiveDelivery;
  c: Count;
  an: ReturnType<typeof deliveryProblems>;
  scan: ReturnType<typeof useScan>;
  inputRef: RefObject<HTMLInputElement | null>;
  openLine: string | null;
  setOpenLine: (id: string | null) => void;
  onPicker: (q: string) => void;
}) {
  const pending = an.infos.length - an.counted.length;
  const sorted = [...an.infos].sort((a, b) => b.l.rank - a.l.rank || a.l.no - b.l.no);
  return (
    <Panel
      title={RCT.lines.title}
      aside={
        <span className="text-ink-600 text-[12.5px]">
          {RCT.lines.counted(an.counted.length, pending)}
        </span>
      }
      className="flex min-w-0 flex-col gap-3"
    >
      {an.infos.some((x) => x.i.m.cold) ? <ColdTimer arrived={d.arrived} /> : null}
      <ScanBand scan={scan} inputRef={inputRef} onPicker={onPicker} />
      {sorted.length === 0 ? (
        <p className="text-ink-600 m-0 text-[14px]">{RCT.lines.empty}</p>
      ) : null}
      {sorted.map(({ l, i }) => (
        <LineCard
          key={l.id}
          line={l}
          info={i}
          d={d}
          c={c}
          isOpen={openLine === l.id}
          onToggle={() => setOpenLine(openLine === l.id ? null : l.id)}
        />
      ))}
      <div>
        <button type="button" className={pillCls} onClick={() => onPicker("")}>
          {RCT.lines.add}
        </button>
      </div>
    </Panel>
  );
}
