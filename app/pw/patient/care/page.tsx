import type { TrendTile } from "@patient-core/care-trends";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { lastSevenDays, longDate } from "@patient-core/care-day";
import { trendTiles } from "@patient-core/care-trends";
import { SLOT_WORDS } from "@patient-core/dose-slots";
import { DAY_GOAL, GLASSES, lastDays, minutesOn, readingsFrom, waterOn } from "@patient-core/log";
import { weekCounts } from "@patient-core/medicines";
import { THRESHOLDS_NOTE } from "@patient-core/readings";
import {
  ArrowDownIcon,
  CalendarIcon,
  ChevronRightIcon,
  DropletIcon,
  FlaskConicalIcon,
  FootprintsIcon,
  PillIcon,
} from "lucide-react";

import { Ring } from "@/components/tide/care-ring";
import {
  ICON,
  IconDisc,
  Pill,
  SectionHead,
  Skeleton,
  StatusPill,
  TextLink,
} from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { CARE_COPY } from "@/content/patient/care";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { loadLabNames } from "@/lib/patient-web/care-labs";
import { loadCareMedicines } from "@/lib/patient-web/care-medicines";
import { loadLog, today } from "@/lib/patient-web/day";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { cn } from "@/lib/utils";
import { RetryButton } from "../_components/home-bits";

export const metadata: Metadata = { title: "Care" };
export const dynamic = "force-dynamic";

const C = CARE_COPY.hub;

const ROW =
  "rounded-pw-card bg-pw-surface shadow-pw-card hover:bg-pw-surface-2 focus-visible:outline-pw-focus flex min-w-0 items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * The Care hub (the phone's (tabs)/care.tsx): medicines this week and what is next, the four trend tiles,
 * lab tests by name, Move and eat, and the care team. Everything is the patient's own log (ADR 0342), with
 * honest empties. Messaging is off (`mobileChat`), so the care-team card offers "Book a visit".
 */
export default async function CareHub() {
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) redirect("/patient/hospitals");
  const now = new Date();
  const unseen = await countUnseenNotifications(scope.userId).catch(() => 0);
  return (
    <>
      <PageHeader title={C.title} subtitle={longDate(now)} unseen={unseen} />
      <div className="grid items-start gap-7 max-[760px]:gap-5 min-[1101px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Suspense fallback={<MedsLoading />}>
            <Medicines userId={scope.userId} now={now} />
          </Suspense>
          <section aria-labelledby="care-trends" className="flex flex-col gap-3">
            <SectionHead
              id="care-trends"
              title={C.trends}
              action={<TextLink href="/patient/care/trends">{C.seeAll}</TextLink>}
            />
            <Suspense fallback={<Skeleton className="h-48" />}>
              <Trends userId={scope.userId} now={now} />
            </Suspense>
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="care-labs" className="flex flex-col gap-3">
            <SectionHead
              id="care-labs"
              title={C.labs}
              action={<TextLink href="/patient/care/labs">{C.allTests}</TextLink>}
            />
            <Suspense fallback={<Skeleton className="h-20" />}>
              <Labs userId={scope.userId} hospitalId={scope.primaryHospitalId} />
            </Suspense>
          </section>
          <section aria-labelledby="care-move" className="flex flex-col gap-3">
            <SectionHead
              id="care-move"
              title={C.move}
              action={<TextLink href="/patient/care/move">{C.open}</TextLink>}
            />
            <Suspense fallback={<Skeleton className="h-32" />}>
              <Move userId={scope.userId} now={now} />
            </Suspense>
          </section>
          <section aria-labelledby="care-team" className="flex flex-col gap-3">
            <SectionHead id="care-team" title={C.seeTeam} />
            <Link href="/patient/book" className={ROW}>
              <IconDisc className="text-pw-area-team bg-pw-surface-2">
                <CalendarIcon className="size-5" {...ICON} />
              </IconDisc>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] leading-[22px] font-semibold">
                  {C.bookVisit}
                </span>
                <span className="text-pw-ink-2 block text-[15px] font-medium">
                  {C.bookVisitLine}
                </span>
              </span>
              <ChevronRightIcon className="text-pw-ink-3 size-5 shrink-0" {...ICON} />
            </Link>
          </section>
        </div>
      </div>
      <p className="text-pw-ink-3 mt-6 text-center text-[13px] font-medium">
        {PATIENT_WEB_COPY.whoSeesLog} {THRESHOLDS_NOTE}
      </p>
    </>
  );
}

function MedsLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <p className="sr-only" role="status">
        {C.loadingMeds}
      </p>
      <Skeleton className="h-[132px]" />
      <Skeleton className="h-[72px]" />
    </div>
  );
}

function Failed({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-pw-ink-2 text-[15px] font-medium">{children}</p>
      <RetryButton />
    </div>
  );
}

async function Medicines({ userId, now }: { userId: string; now: Date }) {
  const data = await loadCareMedicines(userId).catch(() => null);
  if (!data) return <Failed>{CARE_COPY.meds.failed}</Failed>;
  const day = today(data.meds, data.takes, now);
  const { taken: week, totals } = weekCounts(data.meds, data.takes, now);
  const weekTaken = week.reduce((a, b) => a + b, 0);
  const weekTotal = totals.reduce((a, b) => a + b, 0);
  const days = lastSevenDays(now);
  const next =
    day.doses.find((d) => d.status === "due") ?? day.doses.find((d) => d.status === "later");
  const none = !data.meds.length;
  return (
    <>
      <Link
        href="/patient/care/medicines"
        aria-label={C.medsWeekLabel(weekTaken, weekTotal)}
        className="rounded-pw-cascade bg-pw-band text-pw-on-band focus-visible:outline-pw-focus flex items-center gap-4 p-4 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Ring
          value={weekTotal ? weekTaken / weekTotal : 0}
          size={84}
          stroke={10}
          track="stroke-pw-band-glass"
        >
          <span className="text-xl font-bold tabular-nums">
            {Math.round((weekTaken / Math.max(1, weekTotal)) * 100)}%
          </span>
        </Ring>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-pw-on-band-accent text-xs leading-4 font-semibold tracking-[0.06em] uppercase">
            {C.medsWeek}
          </span>
          <span className="text-lg leading-[23px] font-semibold">
            {C.medsWeekLine(weekTaken, weekTotal)}
          </span>
          <span aria-hidden className="flex gap-1">
            {week.map((count, i) => (
              <span key={i} className="flex flex-col items-center gap-[3px]">
                <span
                  className={cn(
                    "size-[18px] rounded-md",
                    count === 0 ? "bg-pw-band-glass" : "bg-pw-accent",
                    count > 0 && count < (totals[i] ?? 0) && "opacity-45",
                    i === 6 && "ring-pw-on-band ring-2",
                  )}
                />
                <span className="text-pw-on-band-2 text-[10px] font-semibold">
                  {days[i]?.letter}
                </span>
              </span>
            ))}
          </span>
        </span>
      </Link>
      <Link href="/patient/care/medicines" className={ROW}>
        <IconDisc className="text-pw-area-medicines bg-pw-surface-2">
          <PillIcon className="size-5" {...ICON} />
        </IconDisc>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-[22px] font-semibold">
            {none
              ? C.addMedicines
              : next
                ? C.slotDue(SLOT_WORDS[next.slot], next.status === "due")
                : day.total
                  ? C.nothingMore
                  : C.noDoses}
          </span>
          <span className="text-pw-ink-2 block text-[15px] font-medium">
            {none
              ? C.addMedicinesLine
              : next
                ? `${next.time} · ${next.medicine}`
                : C.takenToday(day.taken, day.total)}
          </span>
        </span>
        <span className="bg-pw-accent text-pw-on-accent inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold">
          {C.open}
        </span>
      </Link>
    </>
  );
}

async function Trends({ userId, now }: { userId: string; now: Date }) {
  const rows = await loadLog(userId, 60).catch(() => null);
  if (!rows) return <Failed>{CARE_COPY.trends.failed}</Failed>;
  const tiles = trendTiles(readingsFrom(rows), lastDays(now));
  return (
    <ul className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <li key={t.metric}>
          <TrendCard tile={t} />
        </li>
      ))}
    </ul>
  );
}

/** One tile: value, the arrow and the words that say what it means (never colour alone, L4). */
function TrendCard({ tile }: { tile: TrendTile }) {
  const rotate = tile.dir === "down" ? "" : tile.dir === "up" ? "rotate-180" : "-rotate-90";
  const arrow = <ArrowDownIcon className={cn("size-3.5", rotate)} strokeWidth={2.4} aria-hidden />;
  return (
    <Link
      href="/patient/care/trends"
      aria-label={C.tileLabel(tile.name, tile.value, tile.unit, tile.trend)}
      className="rounded-pw-card bg-pw-surface shadow-pw-card hover:bg-pw-surface-2 focus-visible:outline-pw-focus flex min-h-[116px] flex-col gap-1.5 p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="text-pw-ink-2 truncate text-[13px] font-semibold">{tile.name}</span>
      <span className="flex items-baseline gap-1">
        <span className="text-[22px] leading-[26px] font-bold tracking-[-0.02em] tabular-nums">
          {tile.value}
        </span>
        <span className="text-pw-ink-2 text-xs font-medium">{tile.unit}</span>
      </span>
      <span className="mt-auto">
        {tile.tone === "watch" ? (
          <StatusPill tone="caution">{tile.trend}</StatusPill>
        ) : (
          <Pill tone={tile.tone === "good" ? "accent" : "plain"}>
            {tile.dir === "flat" && tile.tone === "neutral" ? null : arrow}
            {tile.trend}
          </Pill>
        )}
      </span>
    </Link>
  );
}

async function Labs({ userId, hospitalId }: { userId: string; hospitalId: string }) {
  const labs = await loadLabNames(userId, hospitalId).catch(() => null);
  const names =
    labs?.state === "ready"
      ? [...labs.ready.map((r) => r.test), ...labs.notReady.map((n) => n.test)]
      : [];
  return (
    <Link href="/patient/care/labs" aria-label={C.labsLabel} className={ROW}>
      <IconDisc className="text-pw-area-medicines bg-pw-surface-2">
        <FlaskConicalIcon className="size-5" {...ICON} />
      </IconDisc>
      <span className="min-w-0 flex-1 text-[15px] font-semibold">
        {!labs ? (
          <span className="text-pw-ink-2 font-medium">{CARE_COPY.labs.failed}</span>
        ) : names.length ? (
          <>
            {names.slice(0, 3).join(", ")}
            {names.length > 3 ? C.andMore(names.length - 3) : ""}
          </>
        ) : (
          <span className="text-pw-ink-2 font-medium">
            {labs.state === "ready" ? C.noTests : CARE_COPY.labs.off}
          </span>
        )}
      </span>
      <ChevronRightIcon className="text-pw-ink-3 size-5 shrink-0" {...ICON} />
    </Link>
  );
}

async function Move({ userId, now }: { userId: string; now: Date }) {
  const rows = await loadLog(userId, 1).catch(() => null);
  if (!rows) return <Failed>{CARE_COPY.move.failed}</Failed>;
  const minutes = minutesOn(rows, [now])[0] ?? 0;
  const water = waterOn(rows, now);
  const item = (
    Icon: typeof DropletIcon,
    value: number,
    goal: number,
    shown: string,
    label: string,
    arc: string,
  ) => (
    <span
      role="img"
      aria-label={`${shown} ${label}`}
      className="flex flex-1 flex-col items-center gap-1.5"
    >
      <Ring value={goal ? value / goal : 0} size={64} stroke={8} arc={arc}>
        <Icon className="text-pw-accent-text size-5" {...ICON} />
      </Ring>
      <span className="text-center">
        <span className="block text-[15px] font-bold tabular-nums">{shown}</span>
        <span className="text-pw-ink-2 block text-xs font-medium">{label}</span>
      </span>
    </span>
  );
  return (
    <Link href="/patient/care/move" className={cn(ROW, "items-start")}>
      {item(
        FootprintsIcon,
        minutes,
        DAY_GOAL,
        C.minutes(minutes),
        C.walkedOf(DAY_GOAL),
        "stroke-pw-accent",
      )}
      {item(
        DropletIcon,
        water,
        GLASSES,
        String(water),
        C.glassesOf(GLASSES),
        "stroke-pw-cascade-2",
      )}
    </Link>
  );
}
