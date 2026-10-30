import type { FlowStep } from "../_components/v2/pieces";
import type { Figure } from "@/lib/pharmacy/workspace-v2/today";
import type { NeedsYouItem, NeedsYouKind } from "@/lib/pharmacy/workspace-v2/needs-you";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardCheckIcon,
  FileWarningIcon,
  HistoryIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  ScaleIcon,
  SheetIcon,
  ShieldCheckIcon,
  TruckIcon,
} from "lucide-react";

import { EmptyState, KeyFigure, KeyFigureGrid, Panel, Pill } from "@/components/tide/work/kit";
import { PillTabs, PrimaryLink, SecondaryLink } from "@/components/tide/work/space";
import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { PHWS2_NEEDS_YOU as N } from "@/content/pharmacy-workspace-v2-needs-you";
import { PHWS2_TODAY as T } from "@/content/pharmacy-workspace-v2-today";
import { formatDuration } from "@/lib/lab/turnaround";
import { todayFigures } from "@/lib/pharmacy/workspace-v2/today";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { LimitsLine } from "../_components/v2/limits-line";
import { InboxRow } from "../_components/v2/inbox-row";
import { FlowStrip } from "../_components/v2/pieces";
import { PAGE_MS, within } from "../_lib/deadline";
import { needsYouFor } from "../_lib/needs-you";
import { loadFlow, loadTodayRows } from "../_lib/today-read";
import { pharmacyV2 } from "../_lib/v2";
import { PaceChart, WeekBars } from "./_components/charts";
import { RefreshButton } from "./_components/refresh";

export const metadata: Metadata = { title: "Today · Pharmacy" };
export const dynamic = "force-dynamic";

const TZ = DEFAULT_TIME_ZONE;
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const stamp = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TZ,
});
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const ICON: Record<NeedsYouKind, LucideIcon> = {
  controlled: ScaleIcon,
  lookBack: HistoryIcon,
  downtime: SheetIcon,
  delivery: TruckIcon,
  requisition: PackageOpenIcon,
  confirm: PackageCheckIcon,
  reaction: FileWarningIcon,
  reconciliation: ClipboardCheckIcon,
  pack: ShieldCheckIcon,
};

/** The inbox's own words for an item (as /pharmacy/needs-you). */
function textOf(i: NeedsYouItem) {
  const t = N.text[i.kind];
  if (i.kind === "reaction" && i.attention) return N.text.reactionPastDue;
  if (typeof t === "string") return t;
  return i.n === 1 ? t.one : fill(t.many, { n: i.n });
}

/** Today (GATE A §6, board Main): is the window keeping up, the six figures, the medicines flow, Needs you, points. */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await pharmacyV2();
  if (!v2.live || !v2.flags.dispensing || !v2.places.includes("today")) notFound();
  const sp = await searchParams;
  const now = new Date();
  const scope = sp.scope === "all" || !v2.acting ? "all" : v2.acting.id;
  const [rows, flow, needs] = await Promise.all([
    within(loadTodayRows(v2, now), PAGE_MS, "today.rows"),
    loadFlow(v2, now),
    needsYouFor(v2),
  ]);
  const t = todayFigures(rows, { points: v2.points, scope, now, timeZone: TZ });
  const all = scope === "all" ? t : todayFigures(rows, { points: v2.points, scope: "all", now, timeZone: TZ });
  const f = t.figures;
  const tabHref = (place: string, key: string) =>
    v2.tabs.find((x) => x.place === place && x.key === key)?.href;
  const allLabel = v2.points.length > 1 ? fill(T.allPoints, { n: v2.points.length }) : T.allPointsOne;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TZ }).format(now);

  const change = (x: Figure) =>
    x.change === null
      ? T.change.noEarlier
      : x.change === 0
        ? fill(T.change.same, { weekday })
        : fill(x.change > 0 ? T.change.more : T.change.fewer, { n: Math.abs(x.change), weekday });
  const bars = (x: Figure, label: string) =>
    x.week ? (
      <WeekBars
        days={x.week}
        label={fill(T.weekAlt, { label, values: x.week.slice(0, 6).join(", "), today: x.week[6]! })}
      />
    ) : undefined;
  const arrivedToday = t.hours.reduce((n, h) => n + h.arrived, 0);
  const suppliedToday = t.hours.reduce((n, h) => n + h.supplied, 0);
  const sumOr = (k: "supplied" | "vitalOut") =>
    rows.vital === null && k === "vitalOut" ? null : t.points.reduce((n, p) => n + (p[k] ?? 0), 0);

  const steps: FlowStep[] = [
    {
      label: T.flow.suppliers,
      n: flow.suppliers?.counting ?? null,
      href: tabHref("store", "deliveries"),
      sub: flow.suppliers
        ? [T.flow.counting, ...(flow.suppliers.names.length ? [flow.suppliers.names.slice(0, 3).join(" · ")] : [])]
        : undefined,
    },
    {
      label: T.flow.stores,
      n: flow.stores?.raised ?? null,
      href: tabHref("store", "issues"),
      sub: flow.stores ? [T.flow.raised] : undefined,
    },
    {
      label: T.flow.points,
      n: flow.points.live,
      href: tabHref("store", "issues"),
      sub: [
        T.flow.live,
        ...(flow.points.toConfirm !== null ? [fill(T.flow.toConfirm, { n: flow.points.toConfirm })] : []),
        ...(v2.acting ? [fill(T.flow.youAreAt, { point: v2.acting.name })] : []),
      ],
    },
    {
      label: T.flow.wards,
      n: flow.wards,
      href: tabHref("store", "wards"),
      sub: flow.wards !== null ? [T.flow.keepStock] : undefined,
    },
    {
      label: T.flow.carts,
      n: flow.carts?.n ?? null,
      href: tabHref("store", "carts"),
      sub: flow.carts ? [T.flow.cartsSub] : undefined,
      notes: flow.carts?.overdue ? [fill(T.flow.overdue, { n: flow.carts.overdue })] : undefined,
    },
    {
      label: T.flow.expiry,
      n: flow.expiry?.expiring ?? null,
      href: tabHref("store", "expiry"),
      sub: flow.expiry
        ? [
            T.flow.batches,
            fill(T.flow.quarantine, { n: flow.expiry.quarantine }),
            ...(flow.expiry.recalls !== null ? [fill(T.flow.recalls, { n: flow.expiry.recalls })] : []),
          ]
        : undefined,
    },
  ];
  const top = needs.slice(0, 5);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {v2.acting && v2.points.length > 1 ? (
          <PillTabs
            label={T.scopeLabel}
            current={scope === "all" ? "all" : "point"}
            tabs={[
              { key: "point", label: v2.acting.name, href: "/pharmacy/today" },
              { key: "all", label: allLabel, href: "/pharmacy/today?scope=all" },
            ]}
          />
        ) : null}
        <span className="text-caption text-muted-foreground ml-auto">
          {fill(T.barsNote, { day: day.format(now).replace(",", "") })} ·{" "}
          {fill(PHWS2.kit.asOf, { time: time.format(now) })}
        </span>
        <RefreshButton label={PHWS2.kit.refresh} busy={PHWS2.kit.working} />
      </div>

      <LimitsLine hospitalId={v2.scope.hospitalId} />

      <section
        aria-labelledby="hero-t"
        className="bg-tide-navy-900 text-tide-on-band rounded-tide-card grid gap-5 p-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="hero-t" className="text-tide-on-band-2 text-[13px] font-semibold">
              {T.hero.title} · {T.hero.today}
            </h2>
            {v2.places.includes("window") ? <PrimaryLink href="/pharmacy/window">{T.hero.open}</PrimaryLink> : null}
          </div>
          <p className="flex items-baseline gap-2">
            <span className="text-[40px] leading-none font-semibold tabular-nums">{t.waiting}</span>
            <span className="text-tide-on-band-2 text-[14px]">{T.hero.waiting}</span>
          </p>
          <ul aria-label={T.hero.stagesLabel} className="border-tide-navy-700 flex flex-col gap-2 border-t pt-3">
            {t.stages.map((s) => (
              <li key={s.stage} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                <span className="min-w-36">{T.hero.stages[s.stage]}</span>
                <strong className="w-8 font-semibold tabular-nums">{s.n}</strong>
                <span className="text-tide-on-band-2">
                  {s.oldestMin === null
                    ? T.hero.noneWaiting
                    : fill(PHWS2.kit.oldest, { wait: formatDuration(s.oldestMin) })}
                </span>
                {s.late ? (
                  <Pill tone="caution">
                    {T.hero.late}
                    <span className="sr-only">, {T.hero.lateWhy}</span>
                  </Pill>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-card text-foreground rounded-tide-tile min-w-0 p-3">
          <PaceChart
            hours={t.hours}
            labels={{
              arrived: T.pace.arrived,
              supplied: T.pace.supplied,
              now: fill(T.pace.now, { time: time.format(now) }),
              viewTable: T.pace.viewTable,
            }}
            alt={fill(T.pace.alt, {
              from: hh(t.hours[0]?.hour ?? 8),
              arrived: arrivedToday,
              supplied: suppliedToday,
            })}
            table={
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr>
                    <th className="py-1 font-medium">{T.pace.hour}</th>
                    <th className="py-1 font-medium">{T.pace.arrived}</th>
                    <th className="py-1 font-medium">{T.pace.supplied}</th>
                  </tr>
                </thead>
                <tbody>
                  {t.hours.map((h) => (
                    <tr key={h.hour}>
                      <td className="py-0.5 tabular-nums">{hh(h.hour)}</td>
                      <td className="py-0.5 tabular-nums">{h.arrived}</td>
                      <td className="py-0.5 tabular-nums">{h.supplied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </div>
      </section>

      <Panel>
        <KeyFigureGrid>
          <KeyFigure
            label={T.figures.supplied}
            value={f.supplied.value}
            spark={bars(f.supplied, T.figures.supplied)}
            change={change(f.supplied)}
            sub={T.subs.supplied}
            href={tabHref("window", "supplied")}
          />
          <KeyFigure
            label={T.figures.notOnShelf}
            value={f.notOnShelf.value}
            spark={bars(f.notOnShelf, T.figures.notOnShelf)}
            change={change(f.notOnShelf)}
            sub={fill(T.subs.notOnShelf, { n: f.boughtOutside })}
            href={tabHref("window", "open")}
          />
          <KeyFigure
            label={T.figures.vitalOut}
            value={f.vitalOut.value}
            noData={PHWS2.kit.notSet}
            spark={bars(f.vitalOut, T.figures.vitalOut)}
            change={f.vitalOut.value === null ? undefined : change(f.vitalOut)}
            sub={f.vitalOut.value === null ? T.subs.noList : T.subs.vitalOut}
            href={f.vitalOut.value === null ? undefined : tabHref("shelf", "stock")}
          />
          <KeyFigure
            label={T.figures.refills}
            value={f.refills.value}
            noData={PHWS2.kit.noData}
            change={f.refills.value === null ? undefined : T.change.noEarlier}
            sub={f.refills.value === null ? undefined : T.subs.refills}
            href={tabHref("window", "refills")}
          />
          <KeyFigure
            label={T.figures.lookBack}
            value={f.lookBack.value}
            spark={bars(f.lookBack, T.figures.lookBack)}
            sub={fill(T.subs.lookBack, { n: f.lookBack.week?.[6] ?? 0 })}
            href={tabHref("window", "supplied")}
          />
          <KeyFigure
            label={T.figures.controlled}
            value={f.controlled.value}
            spark={bars(f.controlled, T.figures.controlled)}
            sub={fill(T.subs.controlled, { n: f.controlled.week?.[6] ?? 0 })}
            href={tabHref("shelf", "controlled")}
          />
        </KeyFigureGrid>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Panel
          title={T.flow.title}
          note={T.flow.note}
          labelledBy="flow-t"
          action={v2.places.includes("store") ? <SecondaryLink href="/pharmacy/store">{T.flow.open}</SecondaryLink> : undefined}
        >
          <FlowStrip steps={steps} label={T.flow.title} />
        </Panel>
        <Panel
          title={T.needsYou}
          labelledBy="ny-t"
          action={
            needs.length ? (
              <Link href="/pharmacy/needs-you" className="text-body-s text-primary underline-offset-4 hover:underline">
                {fill(PHWS2.kit.seeAll, { n: needs.length })}
              </Link>
            ) : undefined
          }
        >
          {top.length ? (
            <ul className="-mx-4">
              {top.map((i) => (
                <InboxRow
                  key={i.id}
                  icon={ICON[i.kind]}
                  text={textOf(i)}
                  sub={i.detail}
                  at={i.since ? fill(N.since, { at: stamp.format(new Date(i.since)) }) : undefined}
                  attention={i.attention}
                  action={<SecondaryLink href={i.href}>{N.actions[i.kind]}</SecondaryLink>}
                />
              ))}
            </ul>
          ) : (
            <EmptyState compact title={N.empty.title} why={N.empty.why} />
          )}
        </Panel>
      </div>

      <Panel title={T.points.title} note={T.points.note} labelledBy="pts-t">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-caption text-muted-foreground">
              <tr>
                {(["point", "queue", "supplied", "vitalOut", "state"] as const).map((c) => (
                  <th key={c} scope="col" className="px-1 py-2 font-medium">
                    {T.points.columns[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.points.map((p) => (
                <tr key={p.id} className="border-border border-t">
                  <th scope="row" className="px-1 py-2.5 font-medium">
                    {p.name}
                  </th>
                  <td className="px-1 tabular-nums">{p.queue}</td>
                  <td className="px-1 tabular-nums">{p.supplied}</td>
                  <td className="px-1 tabular-nums">
                    {p.vitalOut === null ? <span className="text-muted-foreground">{PHWS2.kit.notSet}</span> : p.vitalOut}
                  </td>
                  <td className="px-1">
                    <Pill>{T.points.states[p.state]}</Pill>
                  </td>
                </tr>
              ))}
              {v2.points.length > 1 ? (
                <tr className="border-ink-300 border-t font-semibold">
                  <th scope="row" className="px-1 py-2.5">
                    {T.points.total}
                  </th>
                  <td className="px-1 tabular-nums">{all.waiting}</td>
                  <td className="px-1 tabular-nums">{sumOr("supplied")}</td>
                  <td className="px-1 tabular-nums">
                    {sumOr("vitalOut") ?? <span className="text-muted-foreground">{PHWS2.kit.notSet}</span>}
                  </td>
                  <td className="px-1" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
