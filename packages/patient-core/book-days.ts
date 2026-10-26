import type { FeeInputs } from "../../supabase/functions/_shared/fees";
import type { Fee } from "./fees";

import { PATIENT_BOOKING_HORIZON_DAYS } from "../../supabase/functions/_shared/booking-horizon";
import { feeRange, rangeLine } from "../../supabase/functions/_shared/fees";
import {
  DEFAULT_TIME_ZONE,
  localDateKey,
  localSession,
} from "../../supabase/functions/_shared/slots";
import { feeFor } from "./fees";

/**
 * Book: the open days, the calendar and the choice on Ask for a day, pure. Moved verbatim from the phone's
 * `features/visits/logic.ts` (the day words), `features/visits/calendar-logic.ts` (the calendar),
 * `data/visits.ts` (`clinicDays`, `slotDays`, `mergeDays`, `sessionFee`), `lib/booking.ts` (`sessionTakeable`,
 * the places-left arithmetic) and the derived state of `app/(app)/book/day.tsx`. The phone re-exports these
 * once its files switch over. Nothing here reads a clock on its own; callers pass `now` or `today`.
 * No count of what is left is ever returned for display (ADR 0084).
 */

/* ─── days, in the hospital's zone ───────────────────────────────── */

const TZ = DEFAULT_TIME_ZONE;
const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });
const WEEKDAY = fmt({ weekday: "short" });
const DAY_NUM = fmt({ day: "numeric" });
const MONTH_SHORT = fmt({ month: "short" });
const MONTH_LONG = fmt({ month: "long", year: "numeric" });
const DAY_LONG = fmt({ weekday: "long", day: "numeric", month: "long" });
const DAY_SHORT = fmt({ weekday: "short", day: "numeric", month: "short" });
const CLOCK = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Noon UTC of a `YYYY-MM-DD` key: the same civil day in every zone near Africa. */
export const keyInstant = (key: string) => new Date(`${key}T12:00:00Z`);
export const dayKeyOf = (at: Date | string) => localDateKey(at, TZ);
export const weekdayOf = (key: string) => WEEKDAY.format(keyInstant(key));
export const dayNumberOf = (key: string) => DAY_NUM.format(keyInstant(key));
export const monthShortOf = (key: string) => MONTH_SHORT.format(keyInstant(key));
export const monthTitleOf = (key: string) => MONTH_LONG.format(keyInstant(key));
export const longDayOf = (key: string) => DAY_LONG.format(keyInstant(key));
export const shortDayOf = (key: string) => DAY_SHORT.format(keyInstant(key));
/** "08:00": when doors open, or when something was done. Never "your turn" (law L8). */
export const clockOf = (iso: string) => CLOCK.format(new Date(iso));

export type Part = "Morning" | "Afternoon";
/** Morning or afternoon, split at local noon (ADR 0084 §10). */
export function partOf(iso: string): Part {
  return localSession(iso, TZ) === "morning" ? "Morning" : "Afternoon";
}

export function addDays(key: string, n: number): string {
  return new Date(keyInstant(key).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** The first of the month `delta` months from the month holding `key`. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

/** A Monday-first month grid, `null` for the blanks, always whole weeks. */
export function monthGrid(key: string): (string | null)[] {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++)
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function weeksOf<T>(cells: readonly (T | null)[]): (T | null)[][] {
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Days, hours, minutes and seconds from `now` until `iso`, never below zero. */
export function countdownOf(now: Date, iso: string) {
  const secs = Math.max(0, Math.floor((new Date(iso).getTime() - now.getTime()) / 1000));
  return {
    days: Math.floor(secs / 86_400),
    hours: Math.floor((secs % 86_400) / 3600),
    minutes: Math.floor((secs % 3600) / 60),
    seconds: secs % 60,
  };
}

/* ─── the calendar ───────────────────────────────────────────────── */

/** The last day a patient may book: today plus the shared horizon (ADR 0403). */
export const windowEnd = (today: string) => addDays(today, PATIENT_BOOKING_HORIZON_DAYS);

export function dayState(
  key: string,
  today: string,
  open: ReadonlySet<string>,
): "out" | "open" | "closed" {
  if (key < today || key > windowEnd(today)) return "out";
  return open.has(key) ? "open" : "closed";
}

export function firstOpenDay(today: string, open: ReadonlySet<string>): string | null {
  return [...open].filter((k) => dayState(k, today, open) === "open").sort()[0] ?? null;
}

export function canShift(month: string, delta: -1 | 1, today: string): boolean {
  const next = shiftMonth(month, delta).slice(0, 7);
  return next >= today.slice(0, 7) && next <= windowEnd(today).slice(0, 7);
}

/* ─── clinic days and slots ──────────────────────────────────────── */

/** ceil(capacity × overbooking) − booked, never below 0: the allocator's own arithmetic. */
export function placesLeft(capacity: number, overbooking: number | string, booked: number): number {
  return Math.max(Math.ceil(capacity * Number(overbooking)) - booked, 0);
}

/** A place left AND a clinician named (the core 409s an unnamed day). */
export function sessionTakeable(s: {
  placesLeft: number;
  clinicianUserId: string | null;
}): boolean {
  return s.placesLeft > 0 && s.clinicianUserId !== null;
}

export interface ServiceLineLite {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  reasonCodes: string[];
  fee: FeeInputs;
}

export interface ClinicSession {
  id: string;
  serviceLineId: string;
  startsAtIso: string;
  clinicianUserId: string | null;
  /** "Clinic team" when the day names nobody yet. */
  clinicianName: string;
  venue: string | null;
  placesLeft: number;
}

export interface SlotPick {
  clinicianUserId: string;
  departmentId: string;
  startsAtIso: string;
  endsAtIso: string;
  serviceLineId?: string;
}

export interface SessionOption extends Fee {
  id: string;
  part: Part;
  /** When doors open for a clinic day; null for a clinician's slot. */
  doors: string | null;
  placesLeft: number;
  clinicianName: string;
  clinicName: string;
  room: string;
  slot?: SlotPick;
}

export interface DayOption {
  key: string;
  sessions: SessionOption[];
}

/** The clinician's own slots, as `pt-bookable-clinicians` returns them. */
export interface SlotClinician {
  userId: string;
  fullName: string;
  cadreId: string | null;
  departmentId: string;
  departmentName: string;
  slotsByDate: Record<string, { startsAtIso: string; endsAtIso: string }[]>;
}

function sessionFee(line: ServiceLineLite | undefined): Fee {
  const range = line ? feeRange(line.fee) : null;
  if (!range) return { fee: null, feeLabel: null };
  return { fee: range.minUgx, feeLabel: range.single ? null : rangeLine(range) };
}

/** Published clinic days that take this reason, by day; with `clinicianUserId`, only that clinician's. */
export function clinicDays(
  sessions: readonly ClinicSession[],
  lines: readonly ServiceLineLite[],
  reason: string,
  clinicianUserId?: string,
): DayOption[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const days: DayOption[] = [];
  for (const s of sessions) {
    const line = byId.get(s.serviceLineId);
    if (!line || !line.reasonCodes.includes(reason) || s.clinicianUserId === null) continue;
    if (clinicianUserId && s.clinicianUserId !== clinicianUserId) continue;
    const key = dayKeyOf(s.startsAtIso);
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, sessions: [] }));
    day.sessions.push({
      id: s.id,
      part: partOf(s.startsAtIso),
      doors: clockOf(s.startsAtIso),
      placesLeft: s.placesLeft,
      clinicianName: s.clinicianName,
      clinicName: line.name,
      room: s.venue ?? line.departmentName,
      ...sessionFee(line),
    });
  }
  return days;
}

/** One clinician's open slots as day options, each its own option (one place, never a count shown). */
export function slotDays(
  c: SlotClinician,
  lines: readonly ServiceLineLite[],
  reason: string,
): DayOption[] {
  const line = lines.find(
    (l) => l.departmentId === c.departmentId && l.reasonCodes.includes(reason),
  );
  const fee = line ? feeFor([line], c.departmentId, c.cadreId) : { fee: null, feeLabel: null };
  return Object.keys(c.slotsByDate)
    .sort()
    .flatMap((key) => {
      const sessions = [...(c.slotsByDate[key] ?? [])]
        .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))
        .map(
          (s): SessionOption => ({
            id: `slot:${s.startsAtIso}`,
            part: partOf(s.startsAtIso),
            doors: null,
            placesLeft: 1,
            clinicianName: c.fullName,
            clinicName: c.departmentName,
            room: c.departmentName,
            ...fee,
            slot: {
              clinicianUserId: c.userId,
              departmentId: c.departmentId,
              startsAtIso: s.startsAtIso,
              endsAtIso: s.endsAtIso,
              ...(line ? { serviceLineId: line.id } : {}),
            },
          }),
        );
      return sessions.length ? [{ key, sessions }] : [];
    });
}

export function mergeDays(a: readonly DayOption[], b: readonly DayOption[]): DayOption[] {
  const out = new Map<string, DayOption>();
  for (const d of [...a, ...b]) {
    const had = out.get(d.key);
    out.set(d.key, had ? { key: d.key, sessions: [...had.sessions, ...d.sessions] } : d);
  }
  return [...out.values()].sort((x, y) => x.key.localeCompare(y.key));
}

/* ─── Ask for a day: what the choices resolve to ─────────────────── */

export interface DayChoice {
  picked: string | null;
  part: Part | null;
  /** "any", a session id, or null (= any). */
  whoId: string | null;
  slotId: string | null;
}

/**
 * The phone's derived state on Ask for a day: the day shown (the picked one if open, else the first open),
 * morning or afternoon (the picked part if open, else the first open), and the session the request carries:
 * a named doctor's chosen slot (the first until another is chosen), else the chosen clinician's place, else
 * "Any doctor" = the cheapest open place.
 */
export function resolveDay(
  days: readonly DayOption[],
  today: string,
  doctor: boolean,
  c: DayChoice,
) {
  const openKeys = new Set(
    days.filter((d) => d.sessions.some((s) => s.placesLeft > 0)).map((d) => d.key),
  );
  const first = firstOpenDay(today, openKeys);
  const dayKey = c.picked && dayState(c.picked, today, openKeys) === "open" ? c.picked : first;
  const day = days.find((d) => d.key === dayKey) ?? null;

  const slots = doctor ? (day?.sessions ?? []).filter((s) => s.slot) : [];
  const slotSession = slots.find((s) => s.id === c.slotId) ?? slots[0] ?? null;

  const inPart = (p: Part) => (day?.sessions ?? []).filter((s) => s.part === p);
  const partOpen = (p: Part) => inPart(p).some((s) => s.placesLeft > 0);
  const chosenPart: Part | null =
    c.part && partOpen(c.part)
      ? c.part
      : partOpen("Morning")
        ? "Morning"
        : partOpen("Afternoon")
          ? "Afternoon"
          : null;
  const inChosen = chosenPart ? inPart(chosenPart).filter((s) => s.placesLeft > 0) : [];
  const anySession = [...inChosen].sort((a, b) => (a.fee ?? 0) - (b.fee ?? 0))[0] ?? null;
  const named = inChosen.filter((s) => s.clinicianName !== "Clinic team");
  const whoSel = c.whoId === "any" ? null : c.whoId;
  const session = doctor
    ? slotSession
    : (whoSel && inChosen.find((s) => s.id === whoSel)) || anySession;
  return {
    openKeys,
    first,
    day,
    slots,
    slotSession,
    inPart,
    partOpen,
    chosenPart,
    anySession,
    named,
    whoSel,
    session,
  };
}
