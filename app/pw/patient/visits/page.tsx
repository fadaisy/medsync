import type { WeekVisit } from "./_components/week-view";
import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_LABEL } from "@patient-core/visits";
import {
  dayKeyOf,
  dayLabel,
  dayNumberOf,
  daysBetween,
  inDays,
  nextVisit,
  onCalendar,
  shortDayOf,
  weekdayOf,
} from "@patient-core/visits-calendar";
import { CalendarIcon, ChevronRightIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { VISITS_COPY as C } from "@/content/patient/visits";
import { loadMedicines, today as todayDoses } from "@/lib/patient-web/day";
import { loadWeek } from "@/lib/patient-web/visits-data";
import { formatFullDate, formatOfferExpiry } from "@/lib/patient/booking-format";
import { requirePatientScope } from "@/lib/patient/scope";
import { fetchWaitlist } from "@/lib/patient/waitlist";
import { RetryButton } from "../_components/home-bits";
import { WaitlistOffer } from "./_components/waitlist-offer";
import { WeekView } from "./_components/week-view";
import { reasonTitle } from "./_lib/reason";

export const metadata: Metadata = { title: "Visits" };
export const dynamic = "force-dynamic";

/**
 * This week (the phone's (tabs)/visits.tsx, board TWeek/DWeek): the next-visit pill (by what it is for, never
 * by the clinician), waiting-list offers, the calendar with open clinic days and visits, and the week ahead
 * with today's medicines. All real; a visit shows its status, never a place number or an hour (L8).
 */
export default async function VisitsPage() {
  const scope = await requirePatientScope();
  const now = new Date();
  const todayKey = dayKeyOf(now);
  const [week, waitlist, meds] = await Promise.all([
    loadWeek(scope.userId, scope.primaryHospitalId, now).catch(() => null),
    fetchWaitlist(scope.userId).catch(() => []),
    loadMedicines(scope.userId).catch(() => null),
  ]);
  const doses = meds ? todayDoses(meds.meds, meds.takes, now) : { taken: 0, total: 0 };
  const next = week ? nextVisit(week.upcoming) : null;
  const visits: WeekVisit[] = week
    ? [...week.upcoming, ...week.past]
        .filter((v) => onCalendar(v.status))
        .map((v) => ({
          id: v.id,
          dayKey: dayKeyOf(v.startsAtIso),
          title: reasonTitle(v),
          status: STATUS_LABEL[v.status] ?? "",
          forMember: v.forMember,
          hospitalName: v.hospitalName,
        }))
    : [];

  return (
    <>
      <PageHeader
        overline={C.overline}
        area="visits"
        title={C.title}
        tools={<NextPill next={next} todayKey={todayKey} />}
      />
      <div className="flex max-w-3xl flex-col gap-5">
        {week ? null : (
          <div className="flex flex-col items-start gap-2">
            <p className="rounded-pw-row bg-pw-surface-2 text-pw-ink-2 p-4 text-[15px]">
              {C.failed}
            </p>
            <RetryButton />
          </div>
        )}
        {/* An open offer is the most time-bound thing on the page. */}
        {waitlist.map((entry) => (
          <WaitlistOffer
            key={entry.id}
            id={entry.id}
            offered={entry.state === "offered" && !!entry.offeredStartsAtIso}
            overline={`${entry.memberName ? C.forMember(entry.memberName) : ""}${
              entry.state === "offered" && entry.offeredStartsAtIso ? C.offerOpened : C.inLine
            }`}
            title={entry.serviceLineName}
            hospitalName={entry.hospitalName}
            line={
              entry.state === "offered" && entry.offeredStartsAtIso && entry.offerExpiresAtIso
                ? C.offerLine(
                    formatFullDate(entry.offeredStartsAtIso),
                    formatOfferExpiry(entry.offerExpiresAtIso, now),
                  )
                : C.waitingLine(
                    dayLabel(entry.preferredFrom, now),
                    entry.preferredTo ? dayLabel(entry.preferredTo, now) : null,
                  )
            }
          />
        ))}
        <WeekView
          todayKey={todayKey}
          visits={visits}
          openDays={week?.openDays ?? []}
          meds={doses}
          loaded={week !== null}
        />
      </div>
    </>
  );
}

/** The header pill: the next visit by its day and what it is for. No clinician name. */
function NextPill({
  next,
  todayKey,
}: {
  next: {
    id: string;
    startsAtIso: string;
    status: string;
    reason: string;
    departmentName: string;
  } | null;
  todayKey: string;
}) {
  const key = next ? dayKeyOf(next.startsAtIso) : null;
  const title = next ? reasonTitle(next) : C.bookVisit;
  return (
    <Link
      href={next ? `/patient/visits/${next.id}` : "/patient/book"}
      aria-label={
        next && key
          ? C.nextLabel(shortDayOf(key), title, STATUS_LABEL[next.status] ?? "")
          : C.noVisitLabel
      }
      className="bg-pw-surface shadow-pw-card focus-visible:outline-pw-focus flex min-h-12 max-w-full min-w-0 items-center gap-2.5 rounded-full py-1.5 pr-3 pl-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:w-full"
    >
      <span className="bg-pw-band text-pw-on-band grid size-9 shrink-0 place-items-center rounded-full text-center">
        {key ? (
          <span className="flex flex-col leading-none">
            <span className="text-[13px] font-bold">{dayNumberOf(key)}</span>
            <span className="text-pw-on-band-accent text-[8px] font-semibold uppercase">
              {weekdayOf(key)}
            </span>
          </span>
        ) : (
          <CalendarIcon className="size-[18px]" {...ICON} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-pw-ink-2 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">
          <span aria-hidden className="bg-pw-area-visits size-1.5 rounded-full" />
          {next && key ? C.next(inDays(daysBetween(todayKey, key))) : C.noVisit}
        </span>
        <span className="truncate text-[15px] font-semibold">{title}</span>
      </span>
      <ChevronRightIcon className="text-pw-ink-3 size-[18px] shrink-0" {...ICON} />
    </Link>
  );
}
