/**
 * Clinics and schedule (ADRs 0501–0507): the pure model. The workspace is an editor over the engine's records
 * (service lines, session templates, Hub places, staff, desk devices, closures, availability, holiday decisions,
 * fee bands). Edits never touch those records: each is a draft `Change` (a list of row edits with before and
 * after). What admins see is `applyChanges(published, drafts)`; what patients see is `published` (CS3). Publish
 * applies the same edits in one transaction on the server (`cs_publish`, migration 0296). No I/O here.
 */

export type Band = "nurse" | "co" | "mo" | "specialist" | "consultant";
export const BANDS: readonly Band[] = ["nurse", "co", "mo", "specialist", "consultant"];
/** ISO weekday as the engine stores it (session_templates.weekday): 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEK: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export type Tier = "general" | "private" | "both";

export interface Place {
  id: string;
  kind: "block" | "room";
  name: string;
  /** A room's block; null for a block. A room belongs to one block. */
  parentId: string | null;
  /** A block's tier (the private wing); rooms inherit. */
  tier: "general" | "private" | null;
}

export interface BookingRules {
  /** Booking opens this many days ahead (1 week to 2 months). */
  aheadDays: number;
  closes: "start" | "hour" | "eve";
  sameDay: boolean;
  walkins: boolean;
  reminder: boolean;
  /** D-CS-19: off by default, CSO-signed per clinic. */
  followUpSkipTriage: boolean;
}

export interface Clinic {
  id: string;
  name: string;
  shortName: string;
  colour: string;
  departmentId: string;
  blockId: string | null;
  roomIds: string[];
  tier: Tier;
  ages: "all" | "children";
  words: string;
  referral: boolean;
  /** Read from the signed confidential list (service_lines.confidential); never edited here (CS7). */
  confidential: boolean;
  feeMode: "free" | "band" | "flat" | null;
  feeUgx: number | null;
  feePrivateUgx: number | null;
  /** "Set for this clinic": per band, general and/or private. */
  feeOverrides: Partial<Record<Band, { gen?: number; priv?: number }>>;
  rules: BookingRules;
  pay: { cash: boolean; mtn: boolean; airtel: boolean };
  payWhen: "arrive" | "book";
  team: string[];
  live: boolean;
  /** P7: paused at once, audited; resuming goes through publish. */
  paused: boolean;
  /** The Hub catalogue code, when the clinic came from a level preset. */
  code: string | null;
}

export interface Session {
  id: string;
  clinicId: string;
  weekday: Weekday;
  /** Minutes from local midnight. */
  start: number;
  end: number;
  kind: "day" | "times";
  slotMin: number;
  visitMin: number;
  /** null = use the suggested number. */
  places: number | null;
  holdPct: 0 | 10 | 20 | 30;
  brk: { start: number; end: number } | null;
  /** 1 = every week, 2 = every other week (repeat_every_weeks). */
  every: 1 | 2;
  /** 1 = first week of the month (nth_weekday). */
  nth: 1 | null;
  roomIds: string[];
  personIds: string[];
}

export interface Person {
  id: string;
  name: string;
  /** As patients read it ("ENT surgeon"). */
  role: string;
  /** The cadre word shown without consent ("A physician" style). */
  cadre: string;
  band: Band;
  departmentId: string | null;
  officeId: string | null;
  showName: boolean;
  showPhoto: boolean;
  /** CS8: the written-consent record. */
  consentOn: string | null;
  consentBy: string | null;
  /** null until the staff invite is accepted (D-CS-09). */
  userId: string | null;
}

export interface Device {
  id: string;
  kind: "desk" | "tablet" | "screen";
  name: string;
  place: string;
  clinicIds: string[];
  lockMin: 5 | 10 | 15 | null;
  lastSeen: string | null;
  online: boolean;
}

export interface Exception {
  id: string;
  type: "closed" | "away" | "extra";
  from: string;
  to: string;
  /** null = whole day. */
  part: { start: number; end: number } | null;
  /** "all" = every clinic. */
  clinicIds: string[] | "all";
  personId: string | null;
  coverId: string | null;
  policy: "offer" | "call";
  reason: string;
  /** For an extra session. */
  extra: {
    clinicId: string;
    start: number;
    end: number;
    places: number;
    personIds: string[];
    roomIds?: string[];
  } | null;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  /** Eid: date expected, confirm when announced. */
  provisional: boolean;
}
export interface HolidayDecision {
  /** The Hub's public_holidays id. */
  id: string;
  decision: "closed" | "open";
  /** The hospital_holiday_decisions row, once published. */
  rowId?: string;
}

export interface LeaveRequest {
  id: string;
  personId: string;
  from: string;
  to: string;
  am: boolean;
  reason: string;
  sentAt: string;
  status: "new" | "approved" | "declined";
}

export interface FeeBand {
  id: Band;
  general: number;
  private: number;
  /** The hospital_fee_bands row, once published; approved = a second admin published it (CS9). */
  rowId?: string;
  approved?: boolean;
}

export interface Snapshot {
  clinics: Record<string, Clinic>;
  sessions: Record<string, Session>;
  places: Record<string, Place>;
  people: Record<string, Person>;
  devices: Record<string, Device>;
  exceptions: Record<string, Exception>;
  holidays: Record<string, HolidayDecision>;
  leave: Record<string, LeaveRequest>;
  bands: Record<string, FeeBand>;
}
export type Entity = keyof Snapshot;
export const ENTITIES: readonly Entity[] = [
  "clinics",
  "sessions",
  "places",
  "people",
  "devices",
  "exceptions",
  "holidays",
  "leave",
  "bands",
];

export interface Edit {
  entity: Entity;
  key: string;
  before: unknown;
  after: unknown;
}
export interface Change {
  id: string;
  summary: string;
  author: string;
  at: string;
  edits: Edit[];
}

/* ─── drafts (P1–P3, P9) ─────────────────────────────────────────── */

export function emptySnapshot(): Snapshot {
  return {
    clinics: {},
    sessions: {},
    places: {},
    people: {},
    devices: {},
    exceptions: {},
    holidays: {},
    leave: {},
    bands: {},
  };
}

/** The draft view: published records with every change applied in order. Pure; `snap` is not touched. */
export function applyChanges(snap: Snapshot, changes: readonly Change[]): Snapshot {
  const out = { ...snap } as Snapshot;
  const touched = new Set<Entity>();
  for (const ch of changes)
    for (const e of ch.edits) {
      if (!touched.has(e.entity)) {
        (out as unknown as Record<Entity, Record<string, unknown>>)[e.entity] = {
          ...snap[e.entity],
        };
        touched.add(e.entity);
      }
      const t = out[e.entity] as Record<string, unknown>;
      if (e.after == null) delete t[e.key];
      else t[e.key] = e.after;
    }
  return out;
}

/** P3: undo a change and every change after it. The rest is exactly the draft list before it. */
export function undoFrom(
  changes: readonly Change[],
  id: string,
): { kept: Change[]; removed: Change[] } {
  const i = changes.findIndex((c) => c.id === id);
  if (i < 0) return { kept: [...changes], removed: [] };
  return { kept: changes.slice(0, i), removed: changes.slice(i) };
}

/** One edit, with `before` read from the current draft view. */
export function edit<E extends Entity>(
  view: Snapshot,
  entity: E,
  key: string,
  after: Snapshot[E][string] | null,
): Edit {
  return { entity, key, before: view[entity][key] ?? null, after };
}

/**
 * P9: bring a version back. `later` is every change published after that version, oldest first; the result
 * is one draft whose edits put each record back as it was then (newest undone first, each to its first
 * `before`).
 */
export function restoreEdits(view: Snapshot, later: readonly Change[]): Edit[] {
  const first = new Map<string, Edit>();
  for (const ch of later)
    for (const e of ch.edits) {
      const k = `${e.entity}:${e.key}`;
      if (!first.has(k)) first.set(k, e);
    }
  return [...first.values()].map((e) => ({
    entity: e.entity,
    key: e.key,
    before: view[e.entity][e.key] ?? null,
    after: e.before,
  }));
}

/* ─── time ───────────────────────────────────────────────────────── */

export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const sessionsOf = (s: Snapshot, clinicId: string) =>
  Object.values(s.sessions)
    .filter((x) => x.clinicId === clinicId)
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start);

/** Bookable minutes: the session less its break. */
export const workMin = (x: Session) =>
  Math.max(0, x.end - x.start - (x.brk ? Math.max(0, x.brk.end - x.brk.start) : 0));

/** Suggested places: minutes ÷ visit length × clinicians (at least one). */
export function suggestedPlaces(x: Session): number {
  return Math.floor(workMin(x) / Math.max(1, x.visitMin)) * Math.max(1, x.personIds.length);
}
export const placesOf = (x: Session) => x.places ?? suggestedPlaces(x);
/** Places bookable ahead (the rest are held for walk-ins and today). */
export const bookableOf = (x: Session) => placesOf(x) - Math.round((placesOf(x) * x.holdPct) / 100);

/** Places a week: an every-other-week session counts half, a first-of-month one a quarter. */
export function placesAWeek(s: Snapshot, clinicId: string): number {
  return Math.round(
    sessionsOf(s, clinicId).reduce(
      (n, x) => n + placesOf(x) * (x.nth ? 0.25 : x.every === 2 ? 0.5 : 1),
      0,
    ),
  );
}

/* ─── clashes (D-CS-07, P10) ─────────────────────────────────────── */

export interface Clash {
  a: Session;
  b: Session;
  weekday: Weekday;
  rooms: string[];
  people: string[];
  start: number;
  end: number;
}

/**
 * Two sessions on the same weekday can meet when both run every week, or one does, or both run every other
 * week (the engine anchors them on their own valid-from, so they may line up). First-of-month meets
 * everything on its weekday. Conservative on purpose: a possible clash blocks publish.
 */
const canMeet = (a: Session, b: Session) => a.weekday === b.weekday;

export function clashes(s: Snapshot): Clash[] {
  const by = new Map<Weekday, Session[]>();
  for (const x of Object.values(s.sessions)) by.set(x.weekday, [...(by.get(x.weekday) ?? []), x]);
  const out: Clash[] = [];
  for (const [weekday, list] of by) {
    list.sort((p, q) => p.start - q.start || p.id.localeCompare(q.id));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (b.start >= a.end) break;
        if (!canMeet(a, b)) continue;
        const rooms = a.roomIds.filter((r) => b.roomIds.includes(r));
        const people = a.personIds.filter((p) => b.personIds.includes(p));
        if (!rooms.length && !people.length) continue;
        out.push({ a, b, weekday, rooms, people, start: b.start, end: Math.min(a.end, b.end) });
      }
  }
  return out;
}

/** Clashes grouped by clinic pair, with the days and what they share (the Week plan alert). */
export function clashPairs(list: readonly Clash[]) {
  const m = new Map<
    string,
    {
      a: string;
      b: string;
      days: Weekday[];
      rooms: string[];
      people: string[];
      start: number;
      end: number;
      clashes: Clash[];
    }
  >();
  for (const k of list) {
    const key = [k.a.clinicId, k.b.clinicId].sort().join("|");
    const g = m.get(key) ?? {
      a: k.a.clinicId,
      b: k.b.clinicId,
      days: [],
      rooms: [],
      people: [],
      start: k.start,
      end: k.end,
      clashes: [],
    };
    if (!g.days.includes(k.weekday)) g.days.push(k.weekday);
    for (const r of k.rooms) if (!g.rooms.includes(r)) g.rooms.push(r);
    for (const p of k.people) if (!g.people.includes(p)) g.people.push(p);
    g.clashes.push(k);
    m.set(key, g);
  }
  return [...m.values()];
}

/**
 * The nearest start (in 30-minute steps, same length, inside opening hours) where this session's rooms and
 * people are free of every other session that day. null when there is none.
 */
export function nearestFree(
  s: Snapshot,
  x: Session,
  hours: { open: number; close: number },
): number | null {
  const len = x.end - x.start;
  const others = Object.values(s.sessions).filter(
    (o) =>
      o.id !== x.id &&
      o.weekday === x.weekday &&
      (o.roomIds.some((r) => x.roomIds.includes(r)) ||
        o.personIds.some((p) => x.personIds.includes(p))),
  );
  const free = (st: number) => others.every((o) => st >= o.end || st + len <= o.start);
  for (let d = 0; d <= 24 * 60; d += 30)
    for (const st of d ? [x.start + d, x.start - d] : [x.start])
      if (st >= hours.open && st + len <= hours.close && free(st)) return st;
  return null;
}

/* ─── fees (CS9, D-CS-05, D-CS-06) ───────────────────────────────── */

/** The fee for one band at one clinic: free, flat, the clinic's override, or the hospital band. */
export function feeFor(
  c: Clinic,
  band: Band,
  priv: boolean,
  bands: Snapshot["bands"],
): number | null {
  if (c.feeMode === "free") return 0;
  if (c.feeMode === "flat") return priv ? (c.feePrivateUgx ?? c.feeUgx) : c.feeUgx;
  if (c.feeMode !== "band") return null;
  const o = c.feeOverrides[band];
  const own = priv ? o?.priv : o?.gen;
  if (own != null) return own;
  const b = bands[band];
  return b ? (priv ? b.private : b.general) : null;
}

/**
 * What a session's booking card shows and what the desk charges (D-CS-06): doctor's times show the exact fee
 * of that clinician; a clinic day with mixed grades shows the range ("from" the lowest), and the desk charges
 * the grade of the clinician actually seen.
 */
export function sessionFee(
  c: Clinic,
  x: Session,
  s: Snapshot,
  priv: boolean,
): { min: number | null; max: number | null; exact: boolean } {
  const bands = x.personIds.map((p) => s.people[p]?.band).filter(Boolean) as Band[];
  const fees = (bands.length ? bands : (["mo"] as Band[]))
    .map((b) => feeFor(c, b, priv, s.bands))
    .filter((f): f is number => f != null);
  if (!fees.length) return { min: null, max: null, exact: false };
  const min = Math.min(...fees);
  const max = Math.max(...fees);
  return { min, max, exact: x.kind === "times" || min === max };
}

/** The clinic's fee span over all its sessions (for the list and the card). */
export function clinicFee(c: Clinic, s: Snapshot): { min: number | null; max: number | null } {
  if (c.feeMode === "free") return { min: 0, max: 0 };
  const xs = sessionsOf(s, c.id);
  const all = (xs.length ? xs : []).flatMap((x) => {
    const f = sessionFee(c, x, s, false);
    return f.min == null ? [] : [f.min, f.max as number];
  });
  if (!all.length)
    return c.feeMode === "flat" && c.feeUgx != null
      ? { min: c.feeUgx, max: c.feeUgx }
      : { min: null, max: null };
  return { min: Math.min(...all), max: Math.max(...all) };
}

/* ─── colour (CS5, D-CS-08) ──────────────────────────────────────── */

const hexRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrastOnWhite = (hex: string) => {
  const rgb = hexRgb(hex);
  return rgb ? 1.05 / (lum(rgb) + 0.05) : 0;
};
export function hueOf(hex: string): { h: number; s: number } {
  const rgb = hexRgb(hex);
  if (!rgb) return { h: 0, s: 0 };
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d / (1 - Math.abs(mx + mn - 1)) };
}

/** Red is kept for emergencies: hues 345°–15° with any real saturation are refused, and so is under 3:1. */
export function colourCheck(hex: string): {
  ok: boolean;
  why: "red" | "light" | "bad" | null;
  ratio: number;
} {
  if (!hexRgb(hex)) return { ok: false, why: "bad", ratio: 0 };
  const ratio = contrastOnWhite(hex);
  const { h, s } = hueOf(hex);
  if (s > 0.25 && (h >= 345 || h <= 15)) return { ok: false, why: "red", ratio };
  if (ratio < 3) return { ok: false, why: "light", ratio };
  return { ok: true, why: null, ratio };
}

/* ─── readiness (Get ready; S7, S22) ─────────────────────────────── */

export type CheckKey = "sessions" | "people" | "fee" | "desk" | "screen" | "words" | "dept";
export interface Check {
  k: CheckKey;
  ok: boolean;
  block: boolean;
  /** Session days without a clinician, for the words. */
  detail?: Weekday[];
}
export type Status = "live" | "ready" | "setup" | "kids";

/** X1: `deptLive` is the Hub's department state; a clinic in a department that is not live cannot open. */
export function readiness(
  s: Snapshot,
  id: string,
  deptLive: (departmentId: string) => boolean = () => true,
): { checks: Check[]; blockers: Check[]; status: Status } {
  const c = s.clinics[id];
  if (!c) return { checks: [], blockers: [], status: "setup" };
  const xs = sessionsOf(s, id);
  const noDoc = xs.filter((x) => !x.personIds.length).map((x) => x.weekday);
  const fee = c.feeMode === "free" || clinicFee(c, s).min != null;
  const devs = Object.values(s.devices);
  const checks: Check[] = [
    { k: "sessions", ok: xs.length > 0, block: true },
    { k: "people", ok: xs.length > 0 && !noDoc.length, block: true, detail: noDoc },
    { k: "fee", ok: fee, block: true },
    { k: "desk", ok: devs.some((d) => d.kind === "desk" && d.clinicIds.includes(id)), block: true },
    {
      k: "screen",
      ok: devs.some((d) => d.kind === "screen" && d.clinicIds.includes(id)),
      block: false,
    },
    { k: "words", ok: c.words.trim().length > 0, block: false },
    { k: "dept", ok: deptLive(c.departmentId), block: true },
  ];
  const blockers = checks.filter((k) => k.block && !k.ok);
  const status: Status =
    c.ages === "children"
      ? "kids"
      : c.live && !blockers.length
        ? "live"
        : blockers.length
          ? "setup"
          : "ready";
  return { checks, blockers, status };
}

/* ─── impact (P5, D-CS-18) ───────────────────────────────────────── */

/** Booked people per session, from the booking engine's read model (upcoming clinic_sessions.booked_count). */
export type Booked = Record<string, number>;

/**
 * Who a change moves: sessions it removes, re-times or cuts below their bookings, and sessions a closure or
 * time away lands on. Numbers only (no PHI). Cost = texts × the configured unit cost.
 */
export function impactOf(
  view: Snapshot,
  ch: Change,
  booked: Booked,
  unitCost: number,
): { booked: number; texts: number; cost: number } {
  let n = 0;
  for (const e of ch.edits) {
    if (e.entity === "sessions") {
      const b = e.before as Session | null;
      const a = e.after as Session | null;
      if (!b) continue;
      const k = booked[b.id] ?? 0;
      if (!a || a.start !== b.start || a.end !== b.end || a.weekday !== b.weekday) n += k;
      else n += Math.max(0, k - bookableOf(a));
    }
    if (e.entity === "exceptions" && e.after) {
      const x = e.after as Exception;
      if (x.type === "extra") continue;
      for (const ses of Object.values(view.sessions)) {
        const inScope =
          x.type === "away"
            ? ses.personIds.includes(x.personId ?? "") && ses.personIds.length === 1
            : x.clinicIds === "all" || x.clinicIds.includes(ses.clinicId);
        if (inScope && daysOf(x.from, x.to).some((d) => isoDow(d) === ses.weekday))
          n += booked[ses.id] ?? 0;
      }
    }
  }
  return { booked: n, texts: n, cost: n * unitCost };
}

export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export const isoDow = (ymd: string) =>
  (((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday;

/* ─── publish gate (P10) ─────────────────────────────────────────── */

export interface Blocker {
  kind: "clash" | "notReady";
  clinicIds: string[];
}

/** Clashes in the result, and clinics a change would make live that fail a blocking check. */
export function publishBlockers(
  published: Snapshot,
  view: Snapshot,
  deptLive: (departmentId: string) => boolean = () => true,
): Blocker[] {
  const out: Blocker[] = clashPairs(clashes(view)).map((p) => ({
    kind: "clash",
    clinicIds: [p.a, p.b],
  }));
  for (const c of Object.values(view.clinics))
    if (
      c.live &&
      !c.paused &&
      readiness(view, c.id, deptLive).blockers.length &&
      published.clinics[c.id]?.live !== true
    )
      out.push({ kind: "notReady", clinicIds: [c.id] });
  return out;
}

/* ─── bulk change (Change many at once; S15) ─────────────────────── */

export interface Bulk {
  clinicIds: string[];
  days: Weekday[];
  act: "time" | "places";
  /** Minutes for time, a fraction for places (−0.2 … 0.2). */
  amt: number;
}

/** The sessions a bulk change touches and their new rows (times kept inside opening hours). */
export function bulkEdits(view: Snapshot, b: Bulk, hours: { open: number; close: number }): Edit[] {
  return Object.values(view.sessions)
    .filter((x) => b.clinicIds.includes(x.clinicId) && b.days.includes(x.weekday))
    .flatMap((x): Edit[] => {
      if (b.act === "time") {
        const d = Math.max(hours.open - x.start, Math.min(hours.close - x.end, b.amt));
        if (!d) return [];
        const brk = x.brk ? { start: x.brk.start + d, end: x.brk.end + d } : null;
        return [edit(view, "sessions", x.id, { ...x, start: x.start + d, end: x.end + d, brk })];
      }
      if (x.kind === "times") return []; // doctor's-times sessions keep their slots
      const p = Math.max(1, Math.round(placesOf(x) * (1 + b.amt)));
      return p === placesOf(x) ? [] : [edit(view, "sessions", x.id, { ...x, places: p })];
    });
}

/* ─── templates (D-CS-11; S8) ────────────────────────────────────── */

export interface TemplateRow {
  /** Hub catalogue code. */
  code: string;
  days: Weekday[];
  start: number;
  end: number;
}

/** Fill only clinics with no sessions, from their first room and first team member. */
export function templateEdits(
  view: Snapshot,
  rows: readonly TemplateRow[],
  newId: () => string,
): Edit[] {
  const out: Edit[] = [];
  for (const c of Object.values(view.clinics)) {
    const t = rows.find((r) => r.code === c.code);
    if (!t || sessionsOf(view, c.id).length) continue;
    for (const d of t.days) {
      const id = newId();
      out.push(
        edit(view, "sessions", id, {
          id,
          clinicId: c.id,
          weekday: d,
          start: t.start,
          end: t.end,
          kind: "day",
          slotMin: 20,
          visitMin: 15,
          places: null,
          holdPct: 0,
          brk: t.end - t.start > 6 * 60 ? { start: 13 * 60, end: 14 * 60 } : null,
          every: 1,
          nth: null,
          roomIds: c.roomIds.slice(0, 1),
          personIds: c.team.slice(0, 1),
        }),
      );
    }
  }
  return out;
}

/* ─── people (S20) ───────────────────────────────────────────────── */

export const needsOffice = (p: Person) => p.band === "specialist" || p.band === "consultant";

export function personWeek(s: Snapshot, id: string) {
  const xs = Object.values(s.sessions).filter((x) => x.personIds.includes(id));
  const hours = xs.reduce((h, x) => h + (x.end - x.start) / 60, 0);
  const double = clashes(s).filter((k) => k.people.includes(id));
  return { sessions: xs, hours, double };
}

export type PeopleFilter = "all" | "attn" | "away" | "none" | "hidden";
export function peopleFilter(s: Snapshot, f: PeopleFilter, awayIds: ReadonlySet<string>): Person[] {
  return Object.values(s.people).filter((p) => {
    const w = personWeek(s, p.id);
    if (f === "attn") return w.double.length > 0 || (needsOffice(p) && !p.officeId);
    if (f === "away") return awayIds.has(p.id);
    if (f === "none") return !w.sessions.length;
    if (f === "hidden") return !(p.showName && p.consentOn);
    return true;
  });
}

/* ─── consent (CS8) ──────────────────────────────────────────────── */

/** What a booking card, ticket or SMS may name: the name and photo only with a consent record. */
export function cardIdentity(p: Person | undefined): {
  name: string | null;
  photo: boolean;
  cadre: string;
} {
  if (!p) return { name: null, photo: false, cadre: "" };
  const ok = !!p.consentOn && !!p.consentBy;
  return { name: ok && p.showName ? p.name : null, photo: ok && p.showPhoto, cadre: p.cadre };
}

/* ─── pairing (S23) ──────────────────────────────────────────────── */

/** The pairing alphabet `desk_pair_issue` accepts: no I, O, 0 or 1. */
const AL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const pairCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => AL.charAt(b % AL.length)).join("");
