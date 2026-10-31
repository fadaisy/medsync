/**
 * Shift handover, pure (rework TECH-SPEC §3, ported from prototype handover.js): slots at 08:00 and 17:00 Kampala
 * time, the shift a time falls in, the next open slot for a place, and the flags: a missed slot (no record two hours
 * after it), a count that did not match, a handover due within the hour. Plain data in, plain data out.
 */
import { CONTROLS_RULES as R } from "@/content/pharmacy-rework-controls";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Africa/Kampala is UTC+3 all year (the duty roster's SQL uses the same zone). */
const KAMPALA = 3 * HOUR;

export type Shift = "day" | "night";

const localDay0 = (t: number) => Math.floor((t + KAMPALA) / DAY) * DAY - KAMPALA;
export const localHour = (t: number) => new Date(t + KAMPALA).getUTCHours();

/** Every 08:00 and 17:00 between a and b, inclusive. */
export function slotsBetween(a: number, b: number): number[] {
  const out: number[] = [];
  for (let d = localDay0(a); d <= b; d += DAY)
    for (const h of R.slots) {
      const t = d + h * HOUR;
      if (t >= a && t <= b) out.push(t);
    }
  return out;
}

export const shiftOf = (t: number): Shift => {
  const h = localHour(t);
  return h >= 8 && h < 17 ? "day" : "night";
};

export interface HoLine {
  medicineId: string;
  medicineName: string;
  controlled: boolean;
  expected: number;
  counted: number;
  resolution: { how: string } | null;
}

export interface Handover {
  id: string;
  placeId: string;
  slotAt: Date | null;
  at: Date;
  acceptedAt: Date | null;
  from: string;
  to: string;
  toUserId: string;
  keys: boolean;
  seal: string | null;
  sealNew: boolean;
  items: number;
  lines: HoLine[];
}

export interface Miss {
  placeId: string;
  slotAt: Date;
  why: string;
}

export interface HoPlace {
  id: string;
  name: string;
  kind: string;
  /** The place's first handover ever (ms); null: it has never handed over, so no slot counts as missed yet. */
  startedAt?: number | null;
}

const atSlot = (hs: readonly Handover[], placeId: string, slot: number) =>
  hs.some((h) => h.placeId === placeId && h.slotAt && Math.abs(h.slotAt.getTime() - slot) < MIN);
const missed = (ms: readonly Miss[], placeId: string, slot: number) =>
  ms.some((m) => m.placeId === placeId && Math.abs(m.slotAt.getTime() - slot) < MIN);

/** The slot a handover now answers (within the grace of 08:00 or 17:00, not yet done), or null for mid-shift. */
export function slotNow(hs: readonly Handover[], placeId: string, now: number): number | null {
  const g = R.graceHours * HOUR;
  return slotsBetween(now - g, now + g).find((s) => !atSlot(hs, placeId, s)) ?? null;
}

/** The next slot at a place that has no handover and no explanation yet. */
export function nextFor(
  hs: readonly Handover[],
  ms: readonly Miss[],
  placeId: string,
  now: number,
): number | null {
  return (
    slotsBetween(now - R.graceHours * HOUR, now + DAY).find(
      (s) => !atSlot(hs, placeId, s) && !missed(ms, placeId, s),
    ) ?? null
  );
}

export const openLines = (h: Handover) =>
  h.acceptedAt ? h.lines.filter((l) => l.counted !== l.expected && !l.resolution) : [];

export type HoFlag =
  | { k: "miss"; id: string; placeId: string; slot: number }
  | { k: "diff"; id: string; placeId: string; handover: Handover; line: HoLine }
  | { k: "due"; id: string; placeId: string; slot: number };

/** Missed slots (no record 2 h after, in the last 36 h), counts that did not match, and handovers due within the hour. */
export function hoFlags(input: {
  places: readonly HoPlace[];
  handovers: readonly Handover[];
  misses: readonly Miss[];
  now: number;
}): HoFlag[] {
  const { now } = input;
  const f: HoFlag[] = [];
  for (const p of input.places)
    for (const s of slotsBetween(
      Math.max(now - R.lookbackHours * HOUR, p.startedAt ?? -Infinity),
      now - R.graceHours * HOUR,
    ))
      if (
        p.startedAt !== null &&
        !atSlot(input.handovers, p.id, s) &&
        !missed(input.misses, p.id, s)
      )
        f.push({ k: "miss", id: `m${p.id}${s}`, placeId: p.id, slot: s });
  for (const h of input.handovers)
    for (const l of openLines(h))
      f.push({
        k: "diff",
        id: `d${h.id}${l.medicineId}`,
        placeId: h.placeId,
        handover: h,
        line: l,
      });
  for (const p of input.places) {
    const s = nextFor(input.handovers, input.misses, p.id, now);
    if (s !== null && s - now <= HOUR && s - now > -R.graceHours * HOUR)
      f.push({ k: "due", id: `n${p.id}${s}`, placeId: p.id, slot: s });
  }
  return f;
}

/** What a person sees: their own station's flags, or every station's for the in-charge. */
export const hoMine = (flags: readonly HoFlag[], inCharge: boolean, station: string | null) =>
  inCharge ? [...flags] : flags.filter((f) => f.placeId === station);

/** Shift chips in a window, for a "given, not recorded" time that is approximate (prototype DiffDialog). */
export function shiftsIn(from: number, to: number): { at: number; shift: Shift; day: number }[] {
  const out: { at: number; shift: Shift; day: number }[] = [];
  for (let d = localDay0(from) - DAY; d < to; d += DAY)
    for (const [a, b, shift] of [
      [8, 17, "day"],
      [17, 32, "night"],
    ] as const) {
      const s0 = Math.max(d + a * HOUR, from);
      const s1 = Math.min(d + b * HOUR, to);
      if (s1 - s0 >= 30 * MIN) out.push({ at: s0 + (s1 - s0) / 2, shift, day: d + KAMPALA });
    }
  return out;
}
