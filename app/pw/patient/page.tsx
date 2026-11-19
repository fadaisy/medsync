import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import { lastDays, moodsFor, readingsFrom } from "@patient-core/log";
import { weekCounts } from "@patient-core/medicines";
import { memberNumber, tierNow } from "@patient-core/membership";
import { ticketView } from "@patient-core/ticket-view";
import { stageOf } from "@patient-core/visit-stages";
import { nextVisit } from "@patient-core/visits-calendar";
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
import { HomeV2 } from "@/components/tide/v2-home-web";
import { MEMBERSHIP_COPY } from "@/content/patient-app/membership";
import { HOME_COPY as C } from "@/content/patient/home";
import { loadLabNames } from "@/lib/patient-web/care-labs";
import { loadLog, loadMedicines, today } from "@/lib/patient-web/day";
import { loadDoctors } from "@/lib/patient-web/doctors";
import { patientFlag } from "@/lib/patient-web/flags";
import { loadCardIdentity } from "@/lib/patient-web/me-data";
import { loadMembership } from "@/lib/patient-web/membership-v2";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { loadPayStatus } from "@/lib/patient-web/visit-v2";
import { loadWeek } from "@/lib/patient-web/visits-data";
import { fetchAppointments, formatWhen } from "@/lib/patient/appointments";
import { fetchHousehold } from "@/lib/patient/household";
import { requirePatientScope } from "@/lib/patient/scope";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { DayCascade } from "./_components/day-cascade";
import { DoctorsView, QuietRow } from "./_components/doctors";
import { HomeSegments, RetryButton } from "./_components/home-bits";
import { MoodCard } from "./_components/mood-card";
import { buildDay } from "./_lib/cascade";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

// One read per request, shared by the day and the right column.
const log = cache((userId: string) => loadLog(userId, 8));
const medicines = cache((userId: string) => loadMedicines(userId));

/**
 * Home, your day (the phone's (tabs)/index.tsx): the greeting, Today / This week, the mood card, the day
 * cascade and See a doctor; at > 1100 px the next visit, the Log a reading tiles and the week's medicines
 * sit beside them (the split grid, ~1.55 : 1), below that one column in the phone's order.
 */
const TIER_NAMES = {
  basic: MEMBERSHIP_COPY.tiers.basic,
  plus_family: MEMBERSHIP_COPY.tiers.plusFamily,
  plus_care: MEMBERSHIP_COPY.tiers.plusCare,
  family_care: MEMBERSHIP_COPY.tiers.familyCare,
} as const;

/** The patient's own code for the card number; null before it exists. */
async function patientCode(userId: string): Promise<string | null> {
  return (await loadCardIdentity(userId).catch(() => null))?.code ?? null;
}

export default async function PatientHome() {
  const scope = await requirePatientScope();
  const name = scope.fullName?.trim();
  const first = name ? (name.split(/\s+/)[0] ?? C.there) : C.there;
  const unseen = await countUnseenNotifications(scope.userId).catch(() => 0);

  // Patient app v2 (board 16), behind appV2Web: the visit as the ticket, booking, results, household, the card.
  if (patientFlag("appV2Web")) {
    const now = new Date();
    const [week, labs, household, membership] = await Promise.all([
      loadWeek(scope.userId, scope.primaryHospitalId, now).catch(() => null),
      loadLabNames(scope.userId, scope.primaryHospitalId).catch(() => ({ state: "off" as const })),
      fetchHousehold(scope.userId).catch(() => []),
      loadMembership().catch(() => null),
    ]);
    const next = week ? nextVisit(week.upcoming) : null;
    const pay = next ? await loadPayStatus([next.id]).catch(() => new Map()) : new Map();
    const held = tierNow(membership?.row ?? null, now);
    const dayKey = (iso: string) =>
      new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
    return (
      <>
        <PageHeader greeting title={`${C.hello} ${first}`} unseen={unseen} />
        <HomeV2
          visit={
            next
              ? {
                  ticket: ticketView(next, pay.get(next.id), name ?? "You"),
                  stage: stageOf(next.status, null),
                  today: dayKey(next.startsAtIso) === dayKey(now.toISOString()),
                  href: `/patient/visits/${next.id}`,
                }
              : null
          }
          results={
            labs.state === "ready"
              ? { state: "ready", ready: labs.ready.length, waiting: labs.notReady.length }
              : { state: "off" }
          }
          household={household.map((m) => ({ id: m.bookingAgentId, label: m.memberLabel }))}
          doctors={<SeeADoctor hospitalId={scope.primaryHospitalId} />}
          card={{
            tierName: TIER_NAMES[held.tier],
            memberNo: memberNumber(await patientCode(scope.userId)),
            plus: held.tier !== "basic",
          }}
        />
      </>
    );
  }

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
          <SeeADoctor hospitalId={scope.primaryHospitalId} />
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

/** "See a doctor" (the phone's Home): the previews, or one quiet row while loading, on failure or with none. */
function SeeADoctor({ hospitalId }: { hospitalId: string | null }) {
  if (!hospitalId) return <QuietRow line={C.doctorsNoHospital} href="/patient/hospitals" />;
  return (
    <Suspense fallback={<QuietRow line={C.doctorsLoading} />}>
      <Doctors hospitalId={hospitalId} />
    </Suspense>
  );
}

async function Doctors({ hospitalId }: { hospitalId: string }) {
  return <DoctorsView doctors={await loadDoctors(hospitalId).catch(() => null)} />;
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
