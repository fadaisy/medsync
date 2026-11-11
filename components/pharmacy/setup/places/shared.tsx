"use client";

import type { FridgeRow, PlaceRow, PlacesView } from "@/lib/pharmacy/setup/types";
import type { ReactNode } from "react";

import { TONE } from "@/components/pharmacy/roster/swaps";
import { PL } from "@/content/pharmacy-setup-places";
import {
  fridgeState,
  handoverToday,
  hhmm,
  kampalaNow,
  orderDue,
  orderDueTone,
  typedDue,
} from "@/lib/pharmacy/derive/setup/places";
import { cn } from "@/lib/utils";

/**
 * Places' chips: always a word. OK is neutral with an outline (nothing in the pharmacy is green); amber and red as
 * People and roster use them; "now" is ink (no blue status, place hues never mark state).
 */
export type Tone = "ok" | "warn" | "bad" | "info" | "grey";
const T: Record<Tone, string> = {
  ok: "bg-card text-ink-700 shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
  warn: TONE.amber,
  bad: TONE.red,
  info: TONE.blue,
  grey: TONE.grey,
};
export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[22px] w-fit max-w-full items-center rounded-full px-2 py-0.5 text-[11px] leading-[14px] font-bold",
        T[tone],
      )}
    >
      {children}
    </span>
  );
}
export const FRIDGE_TONE = { ok: "ok", near: "warn", out: "bad" } as const;

/** "HH:MM" in Kampala from an ISO time. */
export const clock = (iso: string | null) => (iso ? hhmm(kampalaNow(Date.parse(iso)).min) : null);

/** The Kampala day "YYYY-MM-DD" of an ISO time. */
export const dayOf = (iso: string) => kampalaNow(Date.parse(iso)).date;

export const fridgesAt = (v: PlacesView, placeId: string) =>
  v.fridges.filter((f) => f.placeId === placeId);
export const slotsOf = (v: PlacesView, p: PlaceRow) =>
  handoverToday(p.slots, p.handoversToday, v.nowMin, v.rules.missedMin);
export const stateOf = (v: PlacesView, f: FridgeRow) =>
  f.temp === null ? null : fridgeState(f.temp, v.rules.nearC);

export type Issue = { t: string; red: boolean; now: string[] };
/** The prototype's `issues`: what the Handover, Cold chain and Supply badges show, from the signed numbers. */
export function issuesOf(v: PlacesView): Partial<Record<"ho" | "cold" | "ord", Issue>> {
  const open = v.places.filter((p) => !p.closed);
  const missed = open.flatMap((p) =>
    slotsOf(v, p)
      .filter((h) => h.st === "missed")
      .map((h) => PL.missedLine(p.name, h.t)),
  );
  const noFridge = open
    .filter((p) => p.coldLines.length && !fridgesAt(v, p.id).length)
    .map((p) => PL.noFridgeLine(p.name, p.coldLines));
  let red = false;
  const cold: string[] = [];
  for (const f of v.fridges) {
    const st = stateOf(v, f);
    if (st && st !== "ok") {
      red ||= st === "out";
      cold.push(PL.fridgeLine(f.code, f.temp!, PL.state[st]));
    }
    if (!f.sensorId)
      for (const c of typedDue(f.typed, v.nowMin, v.rules.missedMin))
        if (c.st === "late") cold.push(PL.notTypedLine(f.code, c.t));
  }
  const due = v.suppliers.flatMap((x) => {
    const d = orderDue(x.nextCycleOn, v.today, v.rules.orderDueDays);
    return orderDueTone(d) ? [PL.dueLine(x.name, d!, x.nextCycleOn!, x.leadDays)] : [];
  });
  const out: Partial<Record<"ho" | "cold" | "ord", Issue>> = {};
  if (missed.length) out.ho = { t: PL.missedToday(missed.length), red: true, now: missed };
  if (cold.length || noFridge.length)
    out.cold = { t: PL.coldIssue(cold.length, noFridge.length), red, now: [...cold, ...noFridge] };
  if (due.length) out.ord = { t: PL.ordersDue(due.length), red: false, now: due };
  return out;
}
