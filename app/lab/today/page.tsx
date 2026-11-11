import type { Figures, Period } from "@/lib/lab/today";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { reasonWord } from "@/components/lab/lab-report-view";
import {
  BulletBar,
  Histogram,
  HourlyFlowChart,
  Sparkline,
  StageBar,
} from "@/components/tide/work/charts";
import { EmptyState, KeyFigure, KeyFigureGrid, Panel, Pill } from "@/components/tide/work/kit";
import { FilterChips, PillTabs, PrimaryLink } from "@/components/tide/work/space";
import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import { identitiesFor } from "@/lib/emr/read/results";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { BUCKET_LABELS, BUCKETS, PERIOD_DAYS } from "@/lib/lab/today";
import { loadToday } from "@/lib/lab/today-read";
import { formatDuration } from "@/lib/lab/turnaround";
import { InboxRow } from "../_components/v2/inbox";
import { needsYouFor } from "../_lib/needs-you";
import { one } from "../_lib/place-tabs";
import { labV2 } from "../_lib/places";

export const metadata: Metadata = { title: "Today · Laboratory" };

const T = LABWS2.today;
const PERIODS: Period[] = ["today", "week", "month"];

/** Today (prompt 5.2; ADR 0346): the lab at a glance, the laboratory lead's home. */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.places.includes("today")) notFound();
  const sp = await searchParams;
  const period = PERIODS.find((p) => p === one(sp.period)) ?? "today";
  const sectionParam = one(sp.section) ?? null;
  const now = requestNow();
  const { scope } = v2;
  const [snap, needs] = await Promise.all([
    loadToday({
      hospitalId: scope.hospitalId,
      userId: scope.userId,
      permissions: scope.access.permissions,
      sectionIds: scope.sectionIds,
      now,
      timeZone: LAB_TIME_ZONE,
      period,
      section: sectionParam,
      qc: !!v2.flags.qc,
    }),
    needsYouFor(v2),
  ]);
  const top = needs.slice(0, 4);
  const ids = await identitiesFor(
    scope,
    top.flatMap((i) => (i.patientUserId ? [i.patientUserId] : [])),
    "lab_today",
  );

  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LAB_TIME_ZONE,
  });
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: LAB_TIME_ZONE,
  });
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: LAB_TIME_ZONE,
  }).format(now);
  const against = period === "today" ? fill(T.lastWeekday, { day: weekday }) : T.periodBefore;
  const dayWords = (d: Date) => day.format(d).replace(",", "");
  const asOf =
    period === "today"
      ? fill(T.asOf, {
          day: dayWords(now),
          time: time.format(now),
          earlier: dayWords(snap.compareDay),
        })
      : fill(T.asOfPeriod, {
          from: dayWords(new Date(now.getTime() - (PERIOD_DAYS[period] - 1) * 86_400_000)),
          to: dayWords(now),
        });

  const query = (p: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { period: period === "today" ? null : period, section: sectionParam, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/lab/today${s ? `?${s}` : ""}`;
  };

  const f = snap.figures;
  const b = snap.before;
  const changeCount = (k: keyof Figures) => {
    if (!b) return T.noEarlierData;
    const d = (f[k] as number) - (b[k] as number);
    return d === 0
      ? fill(T.changeSame, { weekday: against })
      : `${d > 0 ? "↑" : "↓"} ${fill(d > 0 ? T.changeMore : T.changeFewer, { n: Math.abs(d), weekday: against })}`;
  };
  const changeTat = () => {
    if (!b || b.tatMedian === null || f.tatMedian === null) return T.noEarlierData;
    const d = f.tatMedian - b.tatMedian;
    return d === 0
      ? fill(T.changeSame, { weekday: against })
      : `${d < 0 ? "↓" : "↑"} ${fill(d < 0 ? T.changeFaster : T.changeSlower, { n: Math.abs(d), weekday: against })}`;
  };
  const spark = (k: keyof NonNullable<typeof snap.spark>, label: string) =>
    snap.spark ? <Sparkline points={snap.spark[k]} label={label} /> : undefined;
  const h = snap.hero;
  const sectionName = (id: string | null) =>
    id ? (snap.sectionNames.get(id) ?? T.noSection) : T.noSection;
  const peak = snap.hours.reduce(
    (best, x) => (x.received > (best?.received ?? -1) ? x : best),
    snap.hours[0],
  );
  const paceWords = h.pace
    ? fill(h.pace.kind === "keeping" ? T.paceKeeping : T.paceGrowing, {
        time: time.format(h.pace.since),
      })
    : T.paceTooEarly;
  const medIdx =
    f.tatMedian === null
      ? null
      : (() => {
          const i = BUCKETS.findIndex((x) => f.tatMedian! < x);
          return i === -1 ? BUCKETS.length : i;
        })();
  const maxTat = Math.max(120, ...snap.sections.map((s) => s.tatMedian ?? 0));
  const scale = Math.ceil(maxTat / 60) * 60;
  const histTotal = snap.histogram.reduce((a, c) => a + c, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PillTabs
          label={T.periodLabel}
          current={period}
          tabs={PERIODS.map((p) => ({
            key: p,
            label: T.periods[p],
            href: query({ period: p === "today" ? null : p }),
          }))}
        />
        <FilterChips
          label={T.sectionLabel}
          current={sectionParam ?? "all"}
          chips={[
            { key: "all", label: T.allSections, href: query({ section: null }) },
            ...[...snap.sectionNames].map(([id, name]) => ({
              key: id,
              label: name,
              href: query({ section: id }),
            })),
          ]}
        />
        <span className="text-caption text-muted-foreground ml-auto">{asOf}</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,2fr)]">
        {/* Hero: what is in the lab now, on navy. */}
        <section
          aria-labelledby="hero-t"
          className="bg-tide-navy-900 text-tide-on-band rounded-tide-card flex flex-col gap-4 p-5"
        >
          <div>
            <h2 id="hero-t" className="text-tide-on-band-2 text-[13px] font-semibold">
              {T.inLabNow}
            </h2>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-semibold tabular-nums">{h.inLab}</span>
              <span className="text-tide-on-band-2 text-[14px]">
                {T.specimens} · {fill(T.outAtPartners, { n: h.outAtPartners })}
              </span>
            </p>
          </div>
          <StageBar
            parts={[
              { label: T.stages.toReceive, n: h.toReceive },
              { label: T.stages.toResult, n: h.toResult },
              { label: T.stages.preliminary, n: h.preliminary },
            ]}
          />
          <ul className="border-tide-navy-700 flex flex-col gap-1.5 border-t pt-3 text-[13.5px]">
            {h.oldestMinutes !== null ? (
              <li>{fill(T.oldestWaiting, { duration: formatDuration(h.oldestMinutes) })}</li>
            ) : null}
            <li className={h.lateNow ? "font-semibold text-amber-300" : undefined}>
              {fill(T.lateNow, { n: h.lateNow })}
            </li>
            <li className="text-tide-on-band-2">{paceWords}</li>
          </ul>
          <div className="mt-auto">
            <PrimaryLink href="/lab/bench">{T.openBench}</PrimaryLink>
          </div>
        </section>

        <Panel>
          <KeyFigureGrid>
            <KeyFigure
              label={T.figures.received}
              value={f.received}
              spark={spark("received", T.figures.received)}
              change={changeCount("received")}
              href="/lab/reports?tab=indicators"
            />
            <KeyFigure
              label={T.figures.released}
              value={f.released}
              noData={T.nothingReleased}
              spark={spark("released", T.figures.released)}
              change={changeCount("released")}
              href="/lab/bench?stage=released"
            />
            <KeyFigure
              label={T.figures.tat}
              value={f.tatMedian}
              unit={T.min}
              spark={spark("tatMedian", T.figures.tat)}
              change={changeTat()}
              href="/lab/reports?tab=indicators"
            />
            <KeyFigure
              label={T.figures.late}
              value={f.withStated ? f.late : null}
              noData={T.noStatedTime}
              spark={spark("late", T.figures.late)}
              sub={
                f.withStated
                  ? fill(T.lateShare, { p: Math.round((f.late / f.withStated) * 100) })
                  : undefined
              }
              change={changeCount("late")}
              href="/lab/reports?tab=indicators"
            />
            <KeyFigure
              label={T.figures.criticals}
              value={f.criticals}
              spark={spark("criticals", T.figures.criticals)}
              sub={
                f.criticals
                  ? fill(T.criticalsAck, {
                      a: f.criticalsAcked,
                      n: f.criticals,
                      m: f.ackMedian ?? T.dash,
                    })
                  : T.criticalsNone
              }
              href="/lab/needs-you?filter=results"
            />
            <KeyFigure
              label={T.figures.rejected}
              value={f.received ? Math.round((f.rejected / f.received) * 1000) / 10 : null}
              unit={T.percent}
              spark={spark("rejected", T.figures.rejected)}
              sub={
                f.rejected
                  ? fill(T.rejectedOf, {
                      n: f.rejected,
                      d: f.received,
                      reason: reasonWord(f.topReason ?? "").toLowerCase(),
                    })
                  : undefined
              }
              change={changeCount("rejected")}
              href="/lab/bench?stage=rejected"
            />
          </KeyFigureGrid>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel
          title={T.perHour}
          labelledBy="perhour-t"
          note={
            snap.hours.length
              ? fill(T.perHourPartial, {
                  hour: `${String(snap.hours.at(-1)!.hour).padStart(2, "0")}:00`,
                })
              : undefined
          }
        >
          <HourlyFlowChart
            hours={snap.hours}
            labels={{
              received: T.perHourReceived,
              released: T.perHourReleased,
              now: fill(T.perHourNow, { time: time.format(now) }),
              viewTable: T.viewTable,
            }}
            alt={
              peak && peak.received > 0
                ? `${fill(T.perHourAlt, { peak: peak.received, hour: `${String(peak.hour).padStart(2, "0")}:00`, pace: paceWords })}`
                : T.peakNone
            }
            table={
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr>
                    <th className="py-1 font-medium">{T.hourCol}</th>
                    <th className="py-1 font-medium">{T.perHourReceived}</th>
                    <th className="py-1 font-medium">{T.perHourReleased}</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.hours.map((x) => (
                    <tr key={x.hour}>
                      <td className="py-0.5 tabular-nums">{`${String(x.hour).padStart(2, "0")}:00`}</td>
                      <td className="py-0.5 tabular-nums">{x.received}</td>
                      <td className="py-0.5 tabular-nums">{x.released}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Panel>
        <Panel title={T.histogram} labelledBy="hist-t">
          {histTotal ? (
            <>
              <Histogram
                counts={snap.histogram}
                buckets={BUCKET_LABELS}
                medianIndex={medIdx}
                medianLabel={
                  f.tatMedian !== null ? fill(T.histogramMedian, { m: f.tatMedian }) : null
                }
                axis={T.histogramAxis}
                alt={`${fill(T.histogramFootnote, { n: histTotal, m: f.late })} ${f.tatMedian !== null ? fill(T.histogramMedian, { m: f.tatMedian }) : ""}`}
              />
              <p className="text-caption text-muted-foreground">
                {fill(T.histogramFootnote, { n: histTotal, m: f.late })}{" "}
                {snap.bedsideExcluded ? T.histogramExcluded : null}
              </p>
            </>
          ) : (
            <EmptyState compact title={T.nothingReleased} />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Panel title={T.sections} labelledBy="sec-t" note={fill(T.sectionsNote, { max: scale })}>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-caption text-muted-foreground">
                <tr>
                  {(
                    [
                      "section",
                      "inLab",
                      "released",
                      "lateNow",
                      "tat",
                      "past",
                      "rejected",
                      "qc",
                    ] as const
                  ).map((c) => (
                    <th key={c} scope="col" className="px-1 py-2 font-medium">
                      {T.columns[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...snap.sections, null].map((l) => {
                  const line = l ?? snap.totals;
                  const total = l === null;
                  return (
                    <tr
                      key={total ? "total" : (line.sectionId ?? "none")}
                      className={
                        total ? "border-ink-300 border-t font-semibold" : "border-border border-t"
                      }
                    >
                      <th scope="row" className="px-1 py-2.5 font-medium">
                        {total ? T.allSectionsRow : sectionName(line.sectionId)}
                      </th>
                      <td className="px-1 tabular-nums">{line.inLab}</td>
                      <td className="px-1 tabular-nums">{line.released}</td>
                      <td className="px-1 tabular-nums">
                        {line.lateNow ? <Pill tone="caution">{line.lateNow}</Pill> : 0}
                      </td>
                      <td className="px-1">
                        <BulletBar
                          value={line.tatMedian}
                          max={scale}
                          label={
                            line.tatMedian === null
                              ? T.noData
                              : fill(T.medianMin, { m: line.tatMedian })
                          }
                        />
                      </td>
                      <td className="px-1 tabular-nums">{line.past}</td>
                      <td className="px-1 tabular-nums">{line.rejected}</td>
                      <td className="px-1">
                        {line.qc ? (
                          <Pill
                            tone={
                              line.qc === "passed"
                                ? "passed"
                                : line.qc === "no_plan" || line.qc === "provisional_target"
                                  ? "neutral"
                                  : "caution"
                            }
                          >
                            {T.qc[line.qc]}
                          </Pill>
                        ) : (
                          <span className="text-muted-foreground">{T.qcNone}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title={T.needsYou}
          labelledBy="ny-t"
          action={
            <Link
              href="/lab/needs-you"
              className="text-body-s text-primary underline-offset-4 hover:underline"
            >
              {LABWS2.needsYou.seeAll}
            </Link>
          }
        >
          {top.length ? (
            <ul className="divide-border -mx-1 flex flex-col divide-y">
              {top.map((i) => (
                <InboxRow
                  key={i.key}
                  item={i}
                  now={now}
                  identity={i.patientUserId ? ids.get(i.patientUserId) : undefined}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              title={LABWS2.needsYou.emptyTitle}
              why={LABWS2.needsYou.emptyNext}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
