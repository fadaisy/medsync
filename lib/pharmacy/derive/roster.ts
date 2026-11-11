/**
 * Set-up › People and roster: the pure rules (PEOPLE-ROSTER.md §17), ported function for function from the prototype's
 * `renderVals`, on real dates instead of week offsets. Every number comes from `RosterParams` (the signed rules);
 * every word is the caller's (content/pharmacy-roster.ts). No I/O.
 */

export type Shift = "day" | "night" | "call";
export const SHIFTS: readonly Shift[] = ["day", "night", "call"];
/** Minutes after midnight, Africa/Kampala. Night and on call run to 08:00 the next morning. */
export const SHIFT_START: Record<Shift, number> = { day: 480, night: 1020, call: 1020 };

export type Cadre =
  | "pharmacist"
  | "technician"
  | "dispenser"
  | "store_keeper"
  | "nurse"
  | "nurse_in_charge"
  | "midwife"
  | "doctor"
  | "clinical_officer";
const WITNESS: readonly Cadre[] = [
  "pharmacist",
  "technician",
  "nurse",
  "nurse_in_charge",
  "midwife",
  "doctor",
];
const LICENSED: readonly Cadre[] = ["pharmacist", "technician", "dispenser"];

export type PlaceKind = "store" | "dispensing_point" | "ward" | "clinic";
export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  shifts: readonly Shift[];
}
export const isPharmacyPlace = (p: Pick<Place, "kind">) =>
  p.kind === "store" || p.kind === "dispensing_point";

export interface Licence {
  body: "PSU" | "AHPC";
  number: string;
  expiresOn: string;
}
export interface Person {
  userId: string;
  name: string;
  cadre: Cadre;
  places: readonly string[];
  licence: Licence | null;
}
export interface Duty {
  userId: string;
  placeId: string;
  date: string;
  shift: Shift;
}
export type LeaveStatus = "pending" | "approved" | "declined" | "withdrawn";
export interface Leave {
  id: string;
  userId: string;
  from: string;
  to: string;
  status: LeaveStatus;
}
export interface Delegation {
  toUser: string;
  places: readonly string[];
  until: string | null;
  canPublish: boolean;
}

export interface RosterParams {
  perShift: number;
  maxWeek: number;
  lateMin: number;
  alertMin: number;
  licWarnDays: number;
  leaveAheadDays: number;
}
export const ROSTER_DEFAULTS: RosterParams = {
  perShift: 2,
  maxWeek: 6,
  lateMin: 10,
  alertMin: 15,
  licWarnDays: 30,
  leaveAheadDays: 7,
};

// ─── Dates (ISO yyyy-mm-dd, calendar arithmetic in UTC) ────────────────────
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) =>
  new Date(ms(iso) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000);
/** 0 = Monday … 6 = Sunday. */
export const dow = (iso: string) => (new Date(ms(iso)).getUTCDay() + 6) % 7;
export const weekStart = (iso: string) => addDays(iso, -dow(iso));
export const weekDates = (start: string) => [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(start, d));

// ─── Who, where ────────────────────────────────────────────────────────────
export const canWitness = (cadre: Cadre | undefined) => !!cadre && WITNESS.includes(cadre);
export const capacity = (shift: Shift, P: RosterParams) => (shift === "call" ? 1 : P.perShift);

/** A Day or Night shift at a ward or pharmacy place needs two people who can witness; clinics are exempt. */
export function needsWitness(
  cell: readonly (Person | undefined)[],
  shift: Shift,
  place: Pick<Place, "kind">,
) {
  return (
    shift !== "call" &&
    place.kind !== "clinic" &&
    cell.filter((p) => canWitness(p?.cadre)).length < 2
  );
}

export const cellOf = (R: readonly Duty[], date: string, placeId: string, shift: Shift) =>
  R.filter((d) => d.date === date && d.placeId === placeId && d.shift === shift).map(
    (d) => d.userId,
  );
export const onShift = (R: readonly Duty[], userId: string, date: string, shift: Shift) =>
  R.some((d) => d.userId === userId && d.date === date && d.shift === shift);
export const dutiesOf = (R: readonly Duty[], userId: string, date: string) =>
  R.filter((d) => d.userId === userId && d.date === date);

// ─── Rest and hours ────────────────────────────────────────────────────────
export type RestBreak =
  | { kind: "after_night"; date: string }
  | { kind: "same_date"; date: string }
  | { kind: "too_many"; n: number };
const breakKey = (b: RestBreak) =>
  b.kind === "too_many" ? `too_many:${b.n}` : `${b.kind}:${b.date}`;

/** The rest breaks one person has in the week starting `start`. */
export function breaksFor(
  R: readonly Duty[],
  start: string,
  userId: string,
  P: RosterParams,
): RestBreak[] {
  const out: RestBreak[] = [];
  let n = 0;
  for (const date of weekDates(start)) {
    const day = onShift(R, userId, date, "day");
    const night = onShift(R, userId, date, "night");
    if (day && onShift(R, userId, addDays(date, -1), "night"))
      out.push({ kind: "after_night", date });
    if (day && night) out.push({ kind: "same_date", date });
    n += Number(day) + Number(night);
  }
  if (n > P.maxWeek) out.push({ kind: "too_many", n });
  return out;
}

export type RestWhy =
  | { kind: "night_before" }
  | { kind: "day_after" }
  | { kind: "also_night" }
  | { kind: "also_day" }
  | { kind: "too_many"; n: number };

/** Why this person on this shift breaks a rest rule (the card's red ring; the assign list's rule chip). */
export function restWhy(
  R: readonly Duty[],
  userId: string,
  date: string,
  shift: Shift,
  adding: boolean,
  P: RosterParams,
) {
  const out: RestWhy[] = [];
  if (shift === "day" && onShift(R, userId, addDays(date, -1), "night"))
    out.push({ kind: "night_before" });
  if (shift === "night" && onShift(R, userId, addDays(date, 1), "day"))
    out.push({ kind: "day_after" });
  if (shift === "day" && onShift(R, userId, date, "night")) out.push({ kind: "also_night" });
  if (shift === "night" && onShift(R, userId, date, "day")) out.push({ kind: "also_day" });
  if (shift !== "call") {
    const n = weekCount(R, userId, weekStart(date)) + (adding ? 1 : 0);
    if (n > P.maxWeek) out.push({ kind: "too_many", n });
  }
  return out;
}
const weekCount = (R: readonly Duty[], userId: string, start: string) =>
  weekDates(start).reduce(
    (n, d) => n + Number(onShift(R, userId, d, "day")) + Number(onShift(R, userId, d, "night")),
    0,
  );

// ─── Leave, licences ───────────────────────────────────────────────────────
export const leaveOn = (
  leaves: readonly Leave[],
  userId: string,
  date: string,
  statuses: readonly LeaveStatus[] = ["approved"],
) =>
  leaves.find(
    (l) => l.userId === userId && statuses.includes(l.status) && l.from <= date && date <= l.to,
  ) ?? null;

export type LicState = "na" | "missing" | "expired" | "soon" | "ok";
export function licState(
  p: Pick<Person, "cadre" | "licence"> | undefined,
  date: string,
  P: RosterParams,
): LicState {
  if (!p || !LICENSED.includes(p.cadre)) return "na";
  if (!p.licence) return "missing";
  if (p.licence.expiresOn < date) return "expired";
  return daysBetween(date, p.licence.expiresOn) <= P.licWarnDays ? "soon" : "ok";
}

// ─── Load ──────────────────────────────────────────────────────────────────
/** Shifts in the five weeks ending with the week starting `start`. */
export const loadOf = (R: readonly Duty[], userId: string, start: string) => {
  const from = addDays(start, -28);
  const to = addDays(start, 6);
  return R.filter((d) => d.userId === userId && d.date >= from && d.date <= to).length;
};

export interface LoadRow {
  userId: string;
  day: number;
  night: number;
  call: number;
  weekend: number;
  holiday: number;
  total: number;
  flag: "heavy" | "light" | null;
  pct: number;
}
export function load(
  R: readonly Duty[],
  people: readonly Person[],
  start: string,
  isHoliday: (iso: string) => boolean,
): LoadRow[] {
  const from = addDays(start, -28);
  const to = addDays(start, 6);
  const rows = people.map((p) => {
    const mine = R.filter((d) => d.userId === p.userId && d.date >= from && d.date <= to);
    const n = (s: Shift) => mine.filter((d) => d.shift === s).length;
    return {
      userId: p.userId,
      day: n("day"),
      night: n("night"),
      call: n("call"),
      weekend: mine.filter((d) => dow(d.date) >= 5).length,
      holiday: mine.filter((d) => isHoliday(d.date)).length,
      total: mine.length,
    };
  });
  const avg = rows.reduce((a, r) => a + r.total, 0) / Math.max(1, rows.length);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return rows
    .map((r) => ({
      ...r,
      flag:
        r.total >= avg * 1.25
          ? ("heavy" as const)
          : r.total <= avg * 0.75
            ? ("light" as const)
            : null,
      pct: Math.round((r.total / max) * 100),
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Best fit and fill gaps ────────────────────────────────────────────────
export type Block =
  | "not_here"
  | "on_leave"
  | "lic_expired"
  | "lic_missing"
  | { already: Shift }
  | null;
export interface Judged {
  block: Block;
  score: number;
  breaks: RestBreak[];
}
export interface JudgeCtx {
  people: readonly Person[];
  leaves: readonly Leave[];
  params: RosterParams;
}

/** §8: is this person blocked from this slot, and how well do they fit (lower is better)? */
export function judge(
  R: readonly Duty[],
  ctx: JudgeCtx,
  date: string,
  placeId: string,
  shift: Shift,
  p: Person,
  cell: readonly string[],
): Judged {
  const P = ctx.params;
  let block: Block = null;
  if (!p.places.includes(placeId)) block = "not_here";
  else if (leaveOn(ctx.leaves, p.userId, date)) block = "on_leave";
  else if (licState(p, date, P) === "expired") block = "lic_expired";
  else if (licState(p, date, P) === "missing") block = "lic_missing";
  else if (onShift(R, p.userId, date, shift)) block = { already: shift };
  const start = weekStart(date);
  const before = new Set(breaksFor(R, start, p.userId, P).map(breakKey));
  const breaks = breaksFor(
    [...R, { userId: p.userId, placeId, date, shift }],
    start,
    p.userId,
    P,
  ).filter((b) => !before.has(breakKey(b)));
  let score = breaks.length * 100;
  if (leaveOn(ctx.leaves, p.userId, date, ["pending"])) score += 40;
  if (SHIFTS.some((s) => s !== shift && onShift(R, p.userId, date, s))) score += 25;
  score += loadOf(R, p.userId, start);
  score += weekCount(R, p.userId, start) * 4;
  if (shift !== "call" && cell.length === 1 && !canWitness(p.cadre)) score += 60;
  return { block, score, breaks };
}

/** Candidates for a slot, unblocked first, then by score; the top row is the best fit when it scores under 100. */
export function candidates(
  R: readonly Duty[],
  ctx: JudgeCtx,
  date: string,
  placeId: string,
  shift: Shift,
): { person: Person; j: Judged; best: boolean }[] {
  const cell = cellOf(R, date, placeId, shift);
  const list = ctx.people
    .filter((p) => p.places.includes(placeId) && !cell.includes(p.userId))
    .map((person) => ({ person, j: judge(R, ctx, date, placeId, shift, person, cell) }))
    .sort((a, b) => Number(!!a.j.block) - Number(!!b.j.block) || a.j.score - b.j.score);
  return list.map((c, i) => ({ ...c, best: i === 0 && !c.j.block && c.j.score < 100 }));
}

/**
 * §8 Fill gaps: the shown week only, from today on; editable pharmacy places only; each slot up to capacity with the
 * best unblocked candidate under 100, on a running copy so each pick counts toward the next. Never breaks a rule.
 */
export function fillGaps(
  R: readonly Duty[],
  ctx: JudgeCtx,
  start: string,
  today: string,
  places: readonly Place[],
): { over: true } | { over: false; added: Duty[]; left: number } {
  if (addDays(start, 6) < today) return { over: true };
  const run = [...R];
  const added: Duty[] = [];
  let left = 0;
  for (const place of places) {
    for (const date of weekDates(start)) {
      if (date < today) continue;
      for (const shift of SHIFTS) {
        if (!place.shifts.includes(shift)) continue;
        while (cellOf(run, date, place.id, shift).length < capacity(shift, ctx.params)) {
          const top = candidates(run, ctx, date, place.id, shift)[0];
          if (!top || top.j.block || top.j.score >= 100) {
            left++;
            break;
          }
          const d = { userId: top.person.userId, placeId: place.id, date, shift };
          run.push(d);
          added.push(d);
        }
      }
    }
  }
  return { over: false, added, left };
}

// ─── Swaps ─────────────────────────────────────────────────────────────────
export type RequestStatus =
  | "colleague"
  | "incharge"
  | "approved"
  | "declined"
  | "rejected"
  | "withdrawn";
export interface SwapRequest {
  id: string;
  fromUser: string;
  toUser: string;
  kind: "cover" | "swap";
  give: Omit<Duty, "userId">;
  take: Omit<Duty, "userId"> | null;
  status: RequestStatus;
}
export interface LocalNow {
  date: string;
  min: number;
}
const started = (slot: Omit<Duty, "userId">, now: LocalNow) =>
  slot.date < now.date || (slot.date === now.date && now.min >= SHIFT_START[slot.shift]);

/** §6: the stored state, or `expired` once the shift started unanswered, or `stale` once the roster moved on. */
export function effStatus(
  rq: SwapRequest,
  R: readonly Duty[],
  now: LocalNow,
): RequestStatus | "expired" | "stale" {
  if (rq.status !== "colleague" && rq.status !== "incharge") return rq.status;
  if (started(rq.give, now) || (rq.take && started(rq.take, now))) return "expired";
  const has = (s: Omit<Duty, "userId">, u: string) =>
    cellOf(R, s.date, s.placeId, s.shift).includes(u);
  if (!has(rq.give, rq.fromUser) || (rq.take && !has(rq.take, rq.toUser))) return "stale";
  return rq.status;
}

export function applySwap(R: readonly Duty[], rq: SwapRequest): Duty[] {
  const same = (d: Duty, s: Omit<Duty, "userId">, u: string) =>
    d.userId === u && d.date === s.date && d.placeId === s.placeId && d.shift === s.shift;
  return R.map((d) =>
    same(d, rq.give, rq.fromUser)
      ? { ...d, userId: rq.toUser }
      : rq.take && same(d, rq.take, rq.toUser)
        ? { ...d, userId: rq.fromUser }
        : d,
  );
}

/** The rest breaks a swap would add, per person (shown before approving). */
export function newBreaks(R: readonly Duty[], rq: SwapRequest, P: RosterParams) {
  const after = applySwap(R, rq);
  const weeks = [
    ...new Set([weekStart(rq.give.date), ...(rq.take ? [weekStart(rq.take.date)] : [])]),
  ];
  const out: { userId: string; b: RestBreak }[] = [];
  for (const u of [rq.fromUser, rq.toUser])
    for (const w of weeks) {
      const before = new Set(breaksFor(R, w, u, P).map(breakKey));
      for (const b of breaksFor(after, w, u, P))
        if (!before.has(breakKey(b))) out.push({ userId: u, b });
    }
  return out;
}

// ─── Who makes the roster ──────────────────────────────────────────────────
export const activeDelegation = (d: Delegation, today: string) => !d.until || d.until >= today;
export function canEditPlace(
  actor: { userId: string; inCharge: boolean },
  place: Pick<Place, "id" | "kind">,
  delegations: readonly Delegation[],
  today: string,
) {
  if (!isPharmacyPlace(place)) return false;
  if (actor.inCharge) return true;
  return delegations.some(
    (d) =>
      d.toUser === actor.userId &&
      activeDelegation(d, today) &&
      (d.places.length === 0 || d.places.includes(place.id)),
  );
}
export const canPublish = (
  actor: { userId: string; inCharge: boolean },
  delegations: readonly Delegation[],
  today: string,
) =>
  actor.inCharge ||
  delegations.some((d) => d.toUser === actor.userId && activeDelegation(d, today) && d.canPublish);

export function canApprove(rq: SwapRequest, canEdit: (placeId: string) => boolean) {
  return canEdit(rq.give.placeId) && (!rq.take || canEdit(rq.take.placeId));
}

// ─── Attendance ────────────────────────────────────────────────────────────
export type Attendance =
  | { kind: "ok" | "late"; at: string }
  | { kind: "none"; today: boolean }
  | null;
const hm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** §12. `signedInMin` is the local minute of the sign-in on the duty date (night sign-ins before 08:00 add 1440). */
export function attendanceOf(
  signedInMin: number | null,
  date: string,
  shift: Shift,
  place: Pick<Place, "kind">,
  now: LocalNow,
  P: RosterParams,
): Attendance {
  if (!isPharmacyPlace(place) || shift === "call") return null;
  const start = SHIFT_START[shift];
  if (date > now.date || (date === now.date && now.min < start)) return null;
  if (signedInMin !== null)
    return { kind: signedInMin - start > P.lateMin ? "late" : "ok", at: hm(signedInMin) };
  if (date === now.date && now.min - start < P.alertMin) return null;
  return { kind: "none", today: date === now.date };
}

// ─── On duty now ───────────────────────────────────────────────────────────
/** §2: before 08:00 it is still the previous date's night; 08:00–17:00 is Day; then Night with on call. */
export function onDutyNow(now: LocalNow): { date: string; shifts: Shift[] } {
  if (now.min < 480) return { date: addDays(now.date, -1), shifts: ["night", "call"] };
  if (now.min < 1020) return { date: now.date, shifts: ["day"] };
  return { date: now.date, shifts: ["night", "call"] };
}

// ─── Coverage ──────────────────────────────────────────────────────────────
export interface Coverage {
  days: { date: string; day: number; night: number; gaps: number }[];
  slots: number;
  filled: number;
  empty: number;
  unwitnessed: number;
}
export function coverage(
  R: readonly Duty[],
  places: readonly Place[],
  dates: readonly string[],
  byId: ReadonlyMap<string, Person>,
): Coverage {
  const c: Coverage = { days: [], slots: 0, filled: 0, empty: 0, unwitnessed: 0 };
  for (const date of dates) {
    const row = { date, day: 0, night: 0, gaps: 0 };
    for (const p of places)
      for (const shift of SHIFTS) {
        if (!p.shifts.includes(shift)) continue;
        const cell = cellOf(R, date, p.id, shift);
        c.slots++;
        if (cell.length) c.filled++;
        else {
          c.empty++;
          row.gaps++;
        }
        if (
          cell.length &&
          needsWitness(
            cell.map((u) => byId.get(u)),
            shift,
            p,
          )
        ) {
          c.unwitnessed++;
          row.gaps++;
        }
        if (shift === "day") row.day += cell.length;
        if (shift === "night") row.night += cell.length;
      }
    c.days.push(row);
  }
  return c;
}

/** §3.6: the month grid, Monday first, whole weeks. */
export function monthCells(year: number, month: number) {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lead = dow(first);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const n = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(first, i - lead);
    return { date, inMonth: i >= lead && i < lead + days };
  });
}

// ─── Public holidays ───────────────────────────────────────────────────────
const FIXED: readonly [number, number, string][] = [
  [1, 1, "New Year's Day"],
  [1, 26, "Liberation Day"],
  [2, 16, "Janani Luwum Day"],
  [3, 8, "Women's Day"],
  [5, 1, "Labour Day"],
  [6, 3, "Martyrs' Day"],
  [6, 9, "Heroes' Day"],
  [10, 9, "Independence Day"],
  [12, 25, "Christmas Day"],
  [12, 26, "Boxing Day"],
];

/** Gregorian Easter Sunday (Anonymous Gregorian algorithm, as the prototype's `holidays(y)`). */
export function easter(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface Holiday {
  name: string;
  confirmed: boolean;
}
/** Fixed days, Good Friday and Easter Monday, plus the gazetted days stored in `public_holidays`. */
export function holidays(year: number, gazetted: readonly ({ day: string } & Holiday)[] = []) {
  const out = new Map<string, Holiday>();
  for (const [m, d, name] of FIXED)
    out.set(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, {
      name,
      confirmed: true,
    });
  const e = easter(year);
  out.set(addDays(e, -2), { name: "Good Friday", confirmed: true });
  out.set(addDays(e, 1), { name: "Easter Monday", confirmed: true });
  for (const g of gazetted)
    if (g.day.startsWith(`${year}-`)) out.set(g.day, { name: g.name, confirmed: g.confirmed });
  return out;
}
