import type { Median, PilotHospital, PilotWeek } from "@/lib/hospital-admin/pilot";
import type { HospitalReport, Ratio, ReportWindow } from "@/lib/hospital-admin/reports";

import { REPORTS as R } from "@/content/hospital-admin/profile-reports";
import { fill } from "@/content/lab-workspace-v2";
import {
  HELD_PAST_STATUSES,
  MIN_RATE_SAMPLE,
  POSITIONS_HONOURED_THRESHOLD,
} from "@/lib/hospital-admin/reports";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

/**
 * Reports (ADR 0516, phase 2): the page's figures as the desk view prints them. Pure formatting over
 * `fetchHospitalReport` and `fetchPilotWeeks`: no figure is computed here that the lib did not compute, and a rate
 * the lib left without a share (under MIN_RATE_SAMPLE) prints "Too few to say", never a percentage. SMS spend is
 * printed once, as a tile; the Sent table breaks the messages down by kind and channel without a second total.
 */

export interface Tile {
  key: "fill" | "noShow" | "seen" | "demand" | "sent" | "sms";
  value: string;
  label: string;
  sub: string;
  /** The value is words, not a number: printed smaller. */
  wordy: boolean;
}
export interface Def {
  term: string;
  text: string;
}
export interface LineRowView {
  id: string;
  name: string;
  fill: string;
  fillBasis: string;
  seen: string;
  seenBasis: string;
  flagged: boolean;
}
export interface SessionRowView {
  id: string;
  name: string;
  when: string;
  seen: string;
  seenBasis: string;
}
export interface WeekCell {
  value: string;
  basis: string | null;
}
export interface WeekRowView {
  key: string;
  label: string;
  sub: boolean;
  booked: number;
  web: number;
  app: number;
  desk: number;
  ussd: number;
  noShows: WeekCell;
  vsGiven: WeekCell;
  seen: WeekCell;
}
export interface SentRowView {
  key: string;
  kind: string;
  channel: string;
  count: number;
  /** "UGX 1200" for an SMS row, "—" otherwise. */
  cost: string;
}
export interface ReportsViewData {
  days: number;
  since: string;
  tiles: Tile[];
  defs: Def[];
  refill: string;
  rx: string;
  linesNote: string;
  lines: LineRowView[];
  sessions: SessionRowView[];
  weeks: WeekRowView[] | null;
  sent: SentRowView[];
}

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  day: "numeric",
  month: "short",
});
const DAY_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const WEEK_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** "68%", or the words when the sample is under MIN_RATE_SAMPLE. Whole points; the basis carries the counts. */
export function percent(r: Ratio): string {
  return r.share === null ? R.tooFew : `${Math.round(r.share * 100)}%`;
}

const basis = (r: Ratio, unit: string) => fill(R.basis, { n: r.numerator, d: r.denominator, unit });

const money = (currency: string, n: number) => fill(R.money, { currency, n: n.toFixed(0) });

function tile(key: Tile["key"], value: string, t: readonly [string, string], sub: string): Tile {
  return { key, value, label: t[0], sub, wordy: value.length > 12 };
}

export function reportTiles(report: HospitalReport): Tile[] {
  const byChannel = new Map<string, number>();
  for (const r of report.sent) byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + r.count);
  const total = report.sent.reduce((a, r) => a + r.count, 0);
  const channels = [...byChannel]
    .map(([c, n]) => fill(R.channelCount, { n, channel: R.channels[c] ?? c }))
    .join(" · ");
  const vars = {
    requests: report.requests,
    places: report.placesPublished,
    joined: report.waitlistJoined,
  };
  return [
    tile(
      "fill",
      percent(report.fillRate),
      R.tiles.fill,
      fill(R.tiles.fill[1], { basis: basis(report.fillRate, R.units.places) }),
    ),
    tile(
      "noShow",
      percent(report.noShowRate),
      R.tiles.noShow,
      fill(R.tiles.noShow[1], { basis: basis(report.noShowRate, R.units.held) }),
    ),
    tile(
      "seen",
      percent(report.waitAccuracy),
      R.tiles.seen,
      fill(R.tiles.seen[1], { basis: basis(report.waitAccuracy, R.units.called) }),
    ),
    tile(
      "demand",
      report.placesPublished > 0 ? `${report.requests} / ${report.placesPublished}` : R.none,
      R.tiles.demand,
      fill(report.placesPublished > 0 ? R.tiles.demand[1] : R.tiles.demandNone, vars),
    ),
    tile(
      "sent",
      String(total),
      R.tiles.sent,
      total > 0 ? fill(R.tiles.sent[1], { channels }) : R.tiles.sentNone,
    ),
    tile(
      "sms",
      money(report.sms.currency ?? "UGX", report.sms.cost),
      R.tiles.sms,
      fill(R.tiles.sms[1], { n: report.sms.messages }),
    ),
  ];
}

export function reportDefs(report: HospitalReport): Def[] {
  const D = R.defs;
  const statuses = HELD_PAST_STATUSES.map((s) => s.replace("_", " ")).join(" / ");
  return [
    { term: D.fill[0], text: D.fill[1] },
    { term: D.noShow[0], text: fill(D.noShow[1], { statuses, unmarked: report.unmarked }) },
    { term: D.seen[0], text: D.seen[1] },
    {
      term: D.demand[0],
      text: `${D.demand[1]} ${
        report.waitlistWaitingNow > 0
          ? fill(D.waitingNow, { n: report.waitlistWaitingNow })
          : D.waitingNone
      }`,
    },
    { term: D.sms[0], text: D.sms[1] },
  ];
}

function linesNote(report: HospitalReport): string {
  const pct = Math.round(POSITIONS_HONOURED_THRESHOLD * 100);
  const flagged = report.perLine.filter((l) => l.positionsNotHonoured).length;
  if (flagged === 0) return fill(R.lines.noneFlagged, { pct, min: MIN_RATE_SAMPLE });
  const lines = flagged === 1 ? R.lines.oneFlagged : fill(R.lines.manyFlagged, { n: flagged });
  return fill(R.lines.flagged, { lines, pct });
}

/* ─── week by week ─────────────────────────────────────────────── */

const W = R.weeks;
const isEmpty = (w: PilotWeek) =>
  w.booked.total === 0 && w.held === 0 && w.unmarked === 0 && w.checkInVsBooked.n === 0;

function vsGiven(m: Median): string {
  if (m.median === null) return R.none;
  const v = Math.round(m.median);
  return v === 0 ? W.onTime : v > 0 ? fill(W.after, { m: v }) : fill(W.before, { m: -v });
}
const wait = (m: Median) =>
  m.median === null ? R.none : fill(W.minutes, { m: Math.round(m.median) });
const count = (m: Median, word: string) => (m.n > 0 ? fill(W.median, { n: m.n, word }) : null);

function weekRow(key: string, label: string, w: PilotWeek, sub: boolean): WeekRowView {
  return {
    key,
    label,
    sub,
    booked: w.booked.total,
    web: w.booked.web,
    app: w.booked.app,
    desk: w.booked.desk,
    ussd: w.booked.ussd,
    noShows: {
      value: w.held > 0 ? fill(W.noShows, { n: w.noShow, d: w.held }) : R.none,
      basis:
        w.held === 0
          ? null
          : [
              w.noShowShare === null
                ? W.tooFewPct
                : fill(W.pct, { p: Math.round(w.noShowShare * 100) }),
              w.unmarked > 0 ? fill(W.unmarked, { n: w.unmarked }) : null,
            ]
              .filter(Boolean)
              .join(" · "),
    },
    vsGiven: { value: vsGiven(w.checkInVsBooked), basis: count(w.checkInVsBooked, W.checkedIn) },
    seen: { value: wait(w.checkInToSeen), basis: count(w.checkInToSeen, W.seenWord) },
  };
}

/** The pilot weeks, newest first, with each clinic line under its week when the hospital runs more than one. */
export function weekRows(data: PilotHospital): WeekRowView[] {
  const showLines = data.lines.length > 1;
  return data.weeks.flatMap((w, i) => {
    const label = i === 0 ? W.thisWeek : WEEK_FMT.format(new Date(`${w.week}T00:00:00Z`));
    const rows = [weekRow(w.week, label, w, false)];
    if (showLines) {
      for (const l of data.lines) {
        const lw = l.weeks[i];
        if (lw && !isEmpty(lw))
          rows.push(weekRow(`${w.week}:${l.lineId ?? "none"}`, l.lineName ?? W.noLine, lw, true));
      }
    }
    return rows;
  });
}

/* ─── the page ─────────────────────────────────────────────────── */

export function reportView(
  report: HospitalReport,
  pilot: PilotHospital | undefined,
  window: ReportWindow,
): ReportsViewData {
  const currency = report.sent.find((r) => r.currency)?.currency ?? "UGX";
  return {
    days: window.days,
    since: DAY_FMT.format(window.from),
    tiles: reportTiles(report),
    defs: reportDefs(report),
    refill: String(report.refillVisits),
    rx:
      report.prescriptionsWritten === null ? R.also.rxUnknown : String(report.prescriptionsWritten),
    linesNote: linesNote(report),
    lines: report.perLine.map((l) => ({
      id: l.serviceLineId,
      name: l.serviceLineName,
      fill: percent(l.fillRate),
      fillBasis: basis(l.fillRate, R.units.places),
      seen: percent(l.waitAccuracy),
      seenBasis: basis(l.waitAccuracy, R.units.calledShort),
      flagged: l.positionsNotHonoured,
    })),
    sessions: report.perSession.map((s) => ({
      id: s.sessionId,
      name: s.serviceLineName,
      when: DAY_TIME_FMT.format(s.startsAt),
      seen: percent(s.waitAccuracy),
      seenBasis: basis(s.waitAccuracy, R.units.calledShort),
    })),
    weeks: pilot ? weekRows(pilot) : null,
    sent: report.sent.map((r) => ({
      key: `${r.kind}:${r.channel}`,
      kind: R.sent.kinds[r.kind] ?? r.kind,
      channel: R.channels[r.channel] ?? r.channel,
      count: r.count,
      cost: r.channel === "sms" ? money(r.currency ?? currency, r.cost) : R.none,
    })),
  };
}
