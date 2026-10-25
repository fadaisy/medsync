import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { lastDays, moodsFor, readingsFrom } from "@patient-core/log";
import { weekCounts } from "@patient-core/medicines";
import {
  ActivityIcon,
  ChevronRightIcon,
  DropletIcon,
  HeartPulseIcon,
  ScaleIcon,
} from "lucide-react";

import {
  Card,
  ICON,
  IconDisc,
  Overline,
  SectionHead,
  Skeleton,
  TextLink,
} from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { HOME_COPY as C } from "@/content/patient/home";
import { loadLog, loadMedicines, today } from "@/lib/patient-web/day";
import { loadDoctors } from "@/lib/patient-web/doctors";
import { patientFlag } from "@/lib/patient-web/flags";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { fetchAppointments, formatWhen } from "@/lib/patient/appointments";
import { requirePatientScope } from "@/lib/patient/scope";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { DayCascade } from "./_components/day-cascade";
import { DoctorsView } from "./_components/doctors";
import { HomeSegments, RetryButton } from "./_components/home-bits";
import { MoodCard } from "./_components/mood-card";
import { buildDay } from "./_lib/cascade";

export const metadata: Metadata = { title: "Home · MedSync" };
export const dynamic = "force-dynamic";

// One read per request, shared by the day and the right column.
const log = cache((userId: string) => loadLog(userId, 8));
const medicines = cache((userId: string) => loadMedicines(userId));

/**
 * Home, your day (the phone's (tabs)/index.tsx): the greeting, Today / This week, the mood card, the day
 * cascade and See a doctor; at > 1100 px the next visit, the Log a reading tiles and the week's medicines
 * sit beside them (the split grid, ~1.55 : 1), below that one column in the phone's order.
 */
export default async function PatientHome() {
  const scope = await requirePatientScope();
  // As the old home: a patient with no hospital chooses one first.
  if (!scope.primaryHospitalId) redirect("/patient/hospitals");
  const name = scope.fullName?.trim();
  const first = name ? (name.split(/\s+/)[0] ?? C.there) : C.there;
  const unseen = await countUnseenNotifications(scope.userId).catch(() => 0);

  return (
    <>
      <PageHeader
        greeting
        title={`${C.hello} ${first}`}
        tools={<HomeSegments />}
        unseen={unseen}
        avatar={{ initials: name ? first.slice(0, 2).toUpperCase() : "·", label: C.avatarLabel }}
      />
      <div className="grid items-start gap-7 max-[760px]:gap-5 min-[1101px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-7 max-[760px]:gap-5">
          <Suspense fallback={<DayLoading />}>
            <Day userId={scope.userId} chat={patientFlag("mobileChat")} />
          </Suspense>
          <section aria-labelledby="see-doctor" className="flex min-w-0 flex-col gap-3">
            <SectionHead
              id="see-doctor"
              title={C.seeDoctor}
              action={<TextLink href="/patient/book">{C.seeAll}</TextLink>}
            />
            <Suspense
              fallback={
                <p role="status" className="text-pw-ink-2 text-[15px]">
                  {C.doctorsLoading}
                </p>
              }
            >
              <Doctors hospitalId={scope.primaryHospitalId} />
            </Suspense>
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-7 max-[760px]:gap-5">
          <Suspense fallback={<Skeleton className="h-32" />}>
            <NextVisit userId={scope.userId} />
          </Suspense>
          <LogTiles />
          <Suspense fallback={<Skeleton className="h-40" />}>
            <MedicinesWeek userId={scope.userId} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function DayLoading() {
  return (
    <section className="flex flex-col gap-3" aria-busy>
      <SectionHead title={C.dayTitle} />
      <p className="sr-only" role="status">
        {C.dayLoading}
      </p>
      <Skeleton className="h-[78px]" />
      <Skeleton className="h-[78px]" />
      <Skeleton className="h-[78px]" />
    </section>
  );
}

async function Day({ userId, chat }: { userId: string; chat: boolean }) {
  const now = new Date();
  const data = await Promise.all([log(userId), medicines(userId)]).catch(() => null);
  const rows = data?.[0] ?? [];
  const mood = moodsFor(rows, lastDays(now));
  const todayMood = mood[mood.length - 1];
  return (
    <>
      <MoodCard
        today={todayMood && todayMood !== "none" ? todayMood : null}
        week={mood}
        chat={chat}
      />
      <section aria-labelledby="your-day" className="flex flex-col gap-3">
        <SectionHead id="your-day" title={C.dayTitle} />
        {data ? (
          <DayCascade
            view={buildDay({
              today: today(data[1].meds, data[1].takes, now),
              medicineCount: data[1].meds.length,
              readings: readingsFrom(rows),
              rows,
              now,
            })}
          />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-pw-ink-2 text-[17px]">{C.dayFailed}</p>
            <RetryButton />
          </div>
        )}
      </section>
    </>
  );
}

async function Doctors({ hospitalId }: { hospitalId: string }) {
  const doctors = await loadDoctors(hospitalId).catch(() => null);
  if (!doctors)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="rounded-pw-row bg-pw-surface-2 text-pw-ink-2 p-4 text-[15px]">
          {C.doctorsFailed}
        </p>
        <RetryButton />
      </div>
    );
  return <DoctorsView doctors={doctors} />;
}

/** The next live visit, with no position and no clock numeral (ADR 0084 §6, §10). */
async function NextVisit({ userId }: { userId: string }) {
  const now = new Date();
  const [visit] = await fetchAppointments(
    userId,
    "upcoming-active",
    1,
    startOfLocalDay(now, DEFAULT_TIME_ZONE),
  ).catch(() => []);
  return (
    <Card className="flex flex-col gap-3">
      <Overline area="visits">{C.nextVisit}</Overline>
      {visit ? (
        <Link
          href={`/patient/visits/${visit.id}`}
          className="rounded-pw-row hover:bg-pw-surface-2 focus-visible:outline-pw-focus -mx-2 flex items-center gap-3 p-2 focus-visible:outline-2"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-[22px] font-semibold">
              {formatWhen(visit.startsAtIso)}
            </span>
            <span className="text-pw-ink-2 block text-[15px] font-medium">
              {visit.departmentName} · {visit.hospitalName}
            </span>
          </span>
          <ChevronRightIcon className="text-pw-ink-3 size-5" {...ICON} />
        </Link>
      ) : (
        <p className="text-pw-ink-2 text-[15px]">{C.noVisit}</p>
      )}
      <TextLink href={visit ? "/patient/visits" : "/patient/book"}>
        {visit ? C.seeVisits : C.bookVisit}
      </TextLink>
    </Card>
  );
}

const TILES = [
  { kind: "bp", Icon: HeartPulseIcon },
  { kind: "sugar", Icon: DropletIcon },
  { kind: "pulse", Icon: ActivityIcon },
  { kind: "weight", Icon: ScaleIcon },
] as const;

function LogTiles() {
  return (
    <section aria-labelledby="log-tiles" className="flex flex-col gap-3">
      <SectionHead id="log-tiles" title={C.logTiles} />
      <ul className="grid grid-cols-2 gap-3">
        {TILES.map(({ kind, Icon }) => (
          <li key={kind}>
            <Link
              href={`/patient/care/readings?kind=${kind}`}
              className="rounded-pw-row bg-pw-surface shadow-pw-card hover:bg-pw-surface-2 focus-visible:outline-pw-focus flex min-h-20 items-center gap-3 p-4 text-[15px] leading-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <IconDisc tone="accent">
                <Icon className="size-5" {...ICON} />
              </IconDisc>
              {C.kindWords[kind]}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

/** Doses taken against doses on the list, each of the last seven days; the text is the chart's finding. */
async function MedicinesWeek({ userId }: { userId: string }) {
  const now = new Date();
  const data = await medicines(userId).catch(() => null);
  if (!data) return null;
  const { taken, totals } = weekCounts(data.meds, data.takes, now);
  const days = lastDays(now);
  const sumTaken = taken.reduce((a, b) => a + b, 0);
  const sumTotal = totals.reduce((a, b) => a + b, 0);
  return (
    <Card className="flex flex-col gap-3">
      <Overline area="medicines">{C.medsWeek}</Overline>
      {sumTotal ? (
        <>
          <p className="text-[17px] leading-[22px] font-semibold">
            {C.medsWeekLine(sumTaken, sumTotal)}
          </p>
          <ol className="flex h-24 items-end gap-2">
            {days.map((d, i) => {
              const total = totals[i] ?? 0;
              const done = taken[i] ?? 0;
              const label = i === days.length - 1 ? C.today : WEEKDAY.format(d);
              return (
                <li key={i} className="flex h-full flex-1 flex-col items-center gap-1">
                  <span className="sr-only">{C.medsDay(label, done, total)}</span>
                  <span
                    aria-hidden
                    className="bg-pw-surface-3 relative w-full flex-1 overflow-hidden rounded-full"
                  >
                    <span
                      className="bg-pw-act absolute inset-x-0 bottom-0 rounded-full"
                      style={{ height: total ? `${(done / total) * 100}%` : 0 }}
                    />
                  </span>
                  <span aria-hidden className="text-pw-ink-3 text-xs font-semibold">
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="text-pw-ink-2 text-[15px]">{C.medsWeekNone}</p>
      )}
      <TextLink href="/patient/care/medicines">
        {sumTotal ? C.seeMedicines : C.addMedicine}
      </TextLink>
    </Card>
  );
}
