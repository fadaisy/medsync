"use client";

import type { DoctorCard } from "@patient-core/doctors";
import Link from "next/link";
import { useState } from "react";
import {
  availabilityWords,
  dayKeyOf,
  doctorFilters,
  matchesFilter,
  shortDayOf,
} from "@patient-core/doctors";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react";

import { Chip, ChipRow } from "@/components/tide/controls";
import { buttonClass, ICON } from "@/components/tide/kit";
import { HOME_COPY as C } from "@/content/patient/home";
import { cn } from "@/lib/utils";

/**
 * "See a doctor" (the phone's features/home/doctors.tsx): filter chips the data can answer, then one ID
 * badge per real clinician. No count of people anywhere (ADR 0084 §6). Ratings stay off on the web
 * (D-PW-08): every badge reads "New". The row scrolls sideways inside its own box only.
 */
export function DoctorsView({ doctors }: { doctors: DoctorCard[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  if (doctors.length === 0)
    return (
      <p className="rounded-pw-row bg-pw-surface-2 text-pw-ink-2 p-4 text-[15px]">
        {C.doctorsNone}
      </p>
    );
  const filters = doctorFilters(doctors);
  const active = filter && filters.includes(filter) ? filter : null;
  const shown = doctors.filter((d) => matchesFilter(d, active));
  return (
    <>
      {filters.length > 0 ? (
        <ChipRow label={C.doctorFilters}>
          {filters.map((f) => (
            <Chip
              key={f}
              selected={active === f}
              onClick={() => setFilter(active === f ? null : f)}
            >
              {f}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-1 pb-3">
        {shown.map((d) => (
          <li key={d.key} className="snap-start">
            <Badge d={d} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The badge: the photo (or initials) over a navy band with a curved shoulder, the fee along the foot. */
function Badge({ d }: { d: DoctorCard }) {
  const firstOpen = d.places.find((p) => p.nextDayKey !== null) ?? null;
  const available = availabilityWords(d.nextDayKey, dayKeyOf(new Date()), shortDayOf);
  const where = firstOpen ?? d.places[0]!;
  const walkIn = d.places.find((p) => p.walkInToday) ?? null;
  const placeWords =
    d.places.length === 1
      ? `${where.departmentName} · ${where.hospitalName}`
      : C.andMore(where.hospitalName, d.places.length - 1);
  const label = `${d.name}, ${d.role}. ${placeWords}. ${available.text}. ${where.feeWords}. ${C.ratingNew}.${
    firstOpen ? C.askForDay : ""
  }`;
  const ask = firstOpen
    ? `/patient/book/day?${new URLSearchParams({
        doctor: d.userId,
        department: firstOpen.departmentId,
        hospital: firstOpen.hospitalId,
      })}`
    : null;
  const AvailIcon = available.today ? CheckIcon : d.nextDayKey ? CalendarIcon : ClockIcon;

  return (
    <article className="rounded-pw-card bg-pw-band text-pw-on-band shadow-pw-float relative flex h-[420px] w-[236px] flex-col overflow-hidden">
      <div className="bg-pw-surface-2 relative h-[252px] shrink-0">
        {d.photoUrl ? (
          // A signed URL good for an hour, from pt-bookable-clinicians: no optimiser in between.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="bg-pw-info-tint grid size-full place-items-center pb-10">
            <span className="bg-pw-surface text-pw-info-text grid size-[104px] place-items-center rounded-full text-[40px] font-semibold">
              {d.initials}
            </span>
          </div>
        )}
        <div aria-hidden className="absolute top-3 left-3 flex items-center gap-1.5">
          <span
            className={cn(
              "grid size-[30px] place-items-center rounded-full",
              available.today ? "bg-pw-accent text-pw-on-accent" : "bg-pw-surface",
              !available.today && (d.nextDayKey ? "text-pw-ink" : "text-pw-ink-3"),
            )}
          >
            <AvailIcon className="size-[15px]" strokeWidth={available.today ? 3 : 2} />
          </span>
          {walkIn ? (
            <span className="bg-pw-band text-pw-on-band-accent flex min-h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold">
              <span className="bg-pw-accent size-[7px] rounded-full" />
              {C.walkInsToday}
            </span>
          ) : null}
        </div>
        <span
          aria-hidden
          className="bg-pw-surface text-pw-ink-3 absolute top-3 right-3 flex min-h-[26px] items-center gap-1 rounded-full px-[9px] text-xs font-semibold"
        >
          <StarIcon className="size-3" {...ICON} />
          {C.ratingNew}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 236 40"
          preserveAspectRatio="none"
          className="fill-pw-band absolute inset-x-0 bottom-0 h-10 w-full"
        >
          <path d="M0 0 H122.7 C155.8 0 155.8 32 188.8 32 H236 V40 H0 Z" />
        </svg>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 pb-4">
        <h3 className="line-clamp-2 text-[21px] leading-[25px] font-semibold tracking-[-0.015em]">
          {ask ? (
            <Link
              href={ask}
              aria-label={label}
              className="focus-visible:outline-pw-focus after:absolute after:inset-0 after:content-[''] focus-visible:outline-2"
            >
              {d.name}
            </Link>
          ) : (
            <span aria-label={label}>{d.name}</span>
          )}
        </h3>
        <p className="text-pw-on-band-2 truncate text-[15px] font-medium">{d.role}</p>
        <p className="text-pw-on-band-2 truncate text-xs font-medium">{placeWords}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2.5">
          <WalletIcon className="text-pw-on-band-2 size-[13px] shrink-0" {...ICON} />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{where.feeWords}</span>
          {walkIn ? (
            <Link
              href={`/patient/book/today?${new URLSearchParams({ clinic: walkIn.departmentId })}`}
              aria-label={C.comeTodayLabel(walkIn.departmentName, walkIn.hospitalName)}
              className={cn(buttonClass("accent", "s"), "relative z-10")}
            >
              {C.comeToday}
            </Link>
          ) : ask ? (
            <span
              aria-hidden
              className="bg-pw-band-glass grid size-[30px] place-items-center rounded-full"
            >
              <ArrowRightIcon className="size-[15px]" {...ICON} />
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
