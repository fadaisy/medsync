"use client";

import type { ChipTone } from "@/components/pharmacy/charts/chip";
import type { Level } from "@/lib/pharmacy/derive/store/counts";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import Link from "next/link";
import { useState } from "react";

import { recordRoomReadingAction } from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { fieldSm, linkBtn } from "@/components/pharmacy/medicines/shared";
import { newKey, useStoreAct } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { coldState, insideLimits, roomState } from "@/lib/pharmacy/derive/store/counts";
import { dayOf, kampala } from "@/lib/pharmacy/derive/store/format";
import { cn } from "@/lib/utils";
import { card, Head, rowLine } from "./shared";

const C = LA.cond;
const LEVEL: Record<Level, ChipTone> = { ok: "ok", warn: "warn", bad: "bad" };
const COLD: Record<ReturnType<typeof coldState>, ChipTone> = {
  ok: "ok",
  near: "warn",
  out: "bad",
};
const clock = (at: string) => kampala(at).slice(11, 16);

/** §F6. Today's readings and the month's line from the room rows; the cold room from the sensor, re-read when one lands. */
export function StoreConditions({ world: w }: { world: StoreWorld }) {
  const { busy, toast, say, run } = useStoreAct();
  const [temp, setTemp] = useState("");
  const [damp, setDamp] = useState("");
  const r = w.rules;
  const today = w.room.filter((x) => dayOf(x.at) === w.today);
  const month = w.room.filter((x) => dayOf(x.at).slice(0, 7) === w.today.slice(0, 7));
  const inside = month.filter((x) => insideLimits(x.temp, x.humidity, r)).length;
  const save = () => {
    const t = parseFloat(temp.replace(",", "."));
    const h = parseInt(damp, 10);
    if (Number.isNaN(t) || Number.isNaN(h)) return say(C.errType);
    run(
      () => recordRoomReadingAction({ clientKey: newKey(), temp: t, humidity: h }),
      (d) => {
        setTemp("");
        setDamp("");
        return d?.inside ? C.inside : d?.tooWarm ? C.warm : C.damp2;
      },
    );
  };
  const cr = w.coldRoom;
  const exc = cr?.outOfRange7d ?? 0;
  const crLine = cr
    ? [
        cr.readAt
          ? cr.sensor
            ? fill(C.sensor, { id: cr.sensor, at: clock(cr.readAt) })
            : fill(C.read, { at: clock(cr.readAt) })
          : null,
        cr.min !== null && cr.max !== null
          ? fill(C.todayRange, { min: cr.min.toFixed(1), max: cr.max.toFixed(1) })
          : null,
        cr.readAt ? (exc ? fill(C.exc, { n: exc }) : C.noExc) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <section className={card}>
        <Head title={C.room} note={fill(C.roomLead, { temp: r.roomTemp })} />
        {today.map((x) => {
          const st = roomState(x.temp, x.humidity, r);
          return (
            <div
              key={x.at}
              className={cn(rowLine, "flex flex-wrap items-center justify-between gap-1.5 pt-2")}
            >
              <span className="text-[13px] tabular-nums">{clock(x.at)}</span>
              <span className="flex gap-1.5">
                <Chip tone={LEVEL[st.temp]}>{fill(C.temp, { n: x.temp.toFixed(1) })}</Chip>
                <Chip tone={LEVEL[st.humidity]}>{fill(C.damp, { n: x.humidity })}</Chip>
              </span>
            </div>
          );
        })}
        {today.length < 2 ? (
          <div className="bg-ink-50 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5">
            <span className="text-[13px] font-semibold">
              {today.length ? C.afternoon : C.morning}
            </span>
            <input
              aria-label={C.tempAria}
              inputMode="decimal"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder={C.tempHolder}
              className={cn(fieldSm, "w-20 font-semibold")}
            />
            <input
              aria-label={C.dampAria}
              inputMode="numeric"
              value={damp}
              onChange={(e) => setDamp(e.target.value.replace(/\D/g, ""))}
              placeholder={C.dampHolder}
              className={cn(fieldSm, "w-24 font-semibold")}
            />
            <LabButton size="sm" variant="primary" busy={busy} onClick={save}>
              {C.save}
            </LabButton>
          </div>
        ) : null}
        <p className="text-ink-600 m-0 text-[12px]">
          {fill(C.month, { n: inside, m: month.length, temp: r.roomTemp, hum: r.humidity })}
        </p>
      </section>
      <section className={card}>
        {cr ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Head title={fill(C.cold, { code: cr.code })} />
              {cr.sensor && cr.temp !== null ? <Tag>{C.live}</Tag> : null}
            </div>
            {cr.temp !== null ? (
              <span className="flex items-center gap-2.5">
                <b className="text-[32px] leading-9 font-semibold tabular-nums">
                  {fill(C.temp, { n: cr.temp.toFixed(1) })}
                </b>
                <Chip tone={COLD[coldState(cr.temp, r)]}>{C.state[coldState(cr.temp, r)]}</Chip>
              </span>
            ) : (
              <span className="text-ink-700 text-[13px]">{C.noRead}</span>
            )}
            {crLine ? <span className="text-ink-700 text-[13px]">{crLine}</span> : null}
            <span className="text-ink-700 text-[13px]">
              {cr.lines.length ? fill(C.lines, { lines: cr.lines.join(", ") }) : C.noLines}
            </span>
          </>
        ) : (
          <span className="text-ink-700 text-[13px]">{C.noCold}</span>
        )}
        <Link href="/pharmacy/setup?tab=places" className={cn(linkBtn, "self-start")}>
          {C.link}
        </Link>
      </section>
      {toast}
    </div>
  );
}
